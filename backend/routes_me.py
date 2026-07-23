"""Hosted mode API routes (/api/me, Cakto webhook)."""
from __future__ import annotations

import asyncio
import hmac
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import app_settings
from auth import UserContext, get_current_user, require_user
from checkout import generate_correlation_id, resolve_charge_status as resolve_openpix_status
from asaas import create_pix_charge, resolve_charge_status
from openpix_fulfillment import fulfill_openpix_order
from openai_chat import build_chat_payload
from supabase_client import rest_get, rest_upsert
from tenant import is_multi_tenant
from user_secrets import get_user_openai_key, get_user_openai_key_status, save_user_openai_key

log = logging.getLogger("legendas.routes_me")


# ---------------------------------------------------------------------------
#  Simple in-memory rate limiter for checkout endpoints
# ---------------------------------------------------------------------------
_rate_buckets: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_S = 600  # ten-minute anti-abuse window
_RATE_MAX_CHECKOUT = 3  # max three billable charge attempts per IP / 10 min
_RATE_MAX_STATUS = 220  # checkout polls every three seconds for five minutes


def _rate_limit(key: str, max_requests: int, request: Request) -> None:
    """Raise 429 if the IP exceeds max_requests within the rate window."""
    from client_ip import get_client_ip
    ip = get_client_ip(request)
    bucket_key = f"{key}:{ip}"
    now = time.monotonic()
    # Purge old entries
    _rate_buckets[bucket_key] = [
        t for t in _rate_buckets[bucket_key] if now - t < _RATE_WINDOW_S
    ]
    if len(_rate_buckets[bucket_key]) >= max_requests:
        raise HTTPException(429, "Muitas requisições. Aguarde um momento.")
    _rate_buckets[bucket_key].append(now)


# ---------------------------------------------------------------------------
#  Server-side price catalog — NEVER trust the frontend price
# ---------------------------------------------------------------------------
_PRICE_CATALOG: dict[str, int] = {
    "clipsaas-main": 3700,    # R$ 37,00 (ClipSaaS — Gerador de Legendas)
    "bump-whatsapp": 1990,    # R$ 19,90 (Suporte WhatsApp)
    "bump-updates": 1990,     # R$ 19,90 (Atualizações Futuras)
}

router = APIRouter()


class MeSettingsUpdate(BaseModel):
    openai_api_key: Optional[str] = None


class MeSettingsTestBody(BaseModel):
    openai_api_key: Optional[str] = None


class CheckoutItem(BaseModel):
    id: str
    name: str
    price_cents: int


class CreateChargeBody(BaseModel):
    name: str
    email: str
    whatsapp: str
    cpf: str
    items: list[CheckoutItem]
    total_cents: int
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None
    fbclid: Optional[str] = None
    fbc: Optional[str] = None
    fbp: Optional[str] = None


class CaktoWebhookBody(BaseModel):
    event: str
    secret: str
    data: dict = {}


@router.get("/api/me")
async def get_me(user: UserContext = Depends(get_current_user)) -> dict:
    u = await require_user(user)
    key_state = get_user_openai_key_status(u.user_id)
    mobile_ready = bool(u.mobile_access)
    return {
        "user_id": u.user_id,
        "email": u.email,
        "access_active": u.access_active or mobile_ready,
        "openai_configured": mobile_ready or bool(key_state["configured"]),
        "openai_key_status": "ready" if mobile_ready else key_state["status"],
        "mobile_access": mobile_ready,
        "mobile_premium": bool(u.mobile_premium),
        "multi_tenant": is_multi_tenant(),
        "job_max_age_hours": __import__("tenant").job_max_age_hours(),
    }


@router.put("/api/me/settings")
async def put_me_settings(
    body: MeSettingsUpdate,
    user: UserContext = Depends(get_current_user),
) -> dict:
    u = await require_user(user)
    key = (body.openai_api_key or "").strip()
    if not key:
        raise HTTPException(400, "Informe sua API key OpenAI.")
    try:
        save_user_openai_key(u.user_id, key)
        # Do not show success unless the exact value can be read back. This
        # catches failed upserts and encryption-key configuration problems.
        if get_user_openai_key(u.user_id) != key:
            raise RuntimeError("A chave salva não pôde ser confirmada.")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        log.exception("failed to verify saved OpenAI key for %s", u.user_id)
        raise HTTPException(500, "Não foi possível confirmar a chave salva.") from exc
    return {"ok": True, "openai_configured": True, "openai_key_status": "ready"}


@router.post("/api/me/settings/test")
async def test_me_settings(
    body: MeSettingsTestBody | None = None,
    user: UserContext = Depends(get_current_user),
) -> dict:
    u = await require_user(user)
    from user_secrets import get_user_openai_key

    key = (body.openai_api_key if body and body.openai_api_key else "").strip()
    if not key or key.startswith("••"):
        key = get_user_openai_key(u.user_id) or ""
    if not key:
        raise HTTPException(400, "Informe uma API key válida para testar")
    url = app_settings.get_openai_chat_url()
    model = app_settings.get_clips_model()
    try:
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=build_chat_payload(
                model,
                [{"role": "user", "content": "Responda apenas: ok"}],
                max_tokens=16,
            ),
            timeout=30,
        )
        if resp.status_code != 200:
            return {"ok": False, "message": resp.text[:300]}
        return {"ok": True, "message": "Conexão com OpenAI OK"}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "message": "Falha de conexão com OpenAI. Verifique a URL e tente novamente."}
    except requests.exceptions.Timeout:
        return {"ok": False, "message": "OpenAI demorou demais para responder. Tente novamente."}
    except Exception as exc:
        log.warning("settings test failed: %s", exc)
        return {"ok": False, "message": "Erro ao testar conexão com OpenAI."}


# ── Checkout PIX (Asaas) ─────────────────────────────────────────


def _get_checkout_order(correlation_id: str) -> dict | None:
    rows = rest_get(
        "orders",
        params={"correlation_id": f"eq.{correlation_id}", "select": "*"},
    )
    return rows[0] if rows else None


def _ensure_checkout_storage_available() -> None:
    """Fail before creating a PIX when paid-order storage is unavailable.

    Creating the charge first can leave a customer with a payable PIX that the
    application cannot fulfill. Keep this probe intentionally tiny.
    """
    try:
        rest_get(
            "orders",
            params={"select": "correlation_id", "limit": "1"},
        )
    except Exception as exc:
        message = str(exc)
        if "exceed_cached_egress_quota" in message:
            log.error("Checkout blocked: Supabase cached egress quota exceeded")
        else:
            log.exception("Checkout blocked: order storage unavailable")
        raise HTTPException(
            503,
            "Pagamento temporariamente indisponível. Nenhuma cobrança foi criada; tente novamente mais tarde.",
        ) from exc


def _ensure_no_recent_checkout(email: str) -> None:
    """Prevent repeated provider charges for the same buyer in a short window."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    rows = rest_get(
        "orders",
        params={
            "customer_email": f"eq.{email.strip().lower()}",
            "status": "eq.pending",
            "created_at": f"gte.{cutoff}",
            "select": "correlation_id",
            "limit": "1",
        },
    )
    if rows:
        raise HTTPException(
            429,
            "Já existe um PIX recente para este e-mail. Use o código gerado ou aguarde alguns minutos.",
        )


def _fulfill_if_paid(correlation_id: str, *, source: str) -> dict | None:
    try:
        return fulfill_openpix_order(correlation_id, source=source)
    except Exception as exc:
        log.exception("PIX fulfillment failed for %s", correlation_id)
        return {"ok": False, "error": str(exc)}


def _resolve_order_charge_status(
    correlation_id: str,
    *,
    charge_id: str,
    order_paid: bool = False,
) -> dict:
    """Keep legacy OpenPix orders payable while new orders use Asaas."""
    if charge_id.startswith("pay_"):
        return resolve_charge_status(
            correlation_id,
            fallback_charge_id=charge_id,
            order_paid=order_paid,
        )
    return resolve_openpix_status(
        correlation_id,
        fallback_charge_id=charge_id or None,
        order_paid=order_paid,
    )


from fastapi import BackgroundTasks

@router.post("/api/checkout/create-charge")
async def create_checkout_charge(
    body: CreateChargeBody,
    background_tasks: BackgroundTasks,
    request: Request,
) -> dict:
    """Create a PIX charge via Asaas and save the order."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    _rate_limit("create-charge", _RATE_MAX_CHECKOUT, request)

    # --- Server-side price validation ---
    # Calculate expected total from the catalog; reject if client total differs.
    expected_total = 0
    item_ids = [item.id for item in body.items]
    if item_ids.count("clipsaas-main") != 1:
        raise HTTPException(400, "O produto principal deve aparecer uma única vez.")
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(400, "O carrinho contém produtos duplicados.")
    for item in body.items:
        catalog_price = _PRICE_CATALOG.get(item.id)
        if catalog_price is None:
            log.warning(
                "create-charge: unknown product id %s (client_price=%d)",
                item.id,
                item.price_cents,
            )
            raise HTTPException(
                400,
                f"Produto desconhecido: {item.id}. Recarregue a página.",
            )
        if item.price_cents != catalog_price:
            log.warning(
                "create-charge: price mismatch for %s: client=%d server=%d",
                item.id,
                item.price_cents,
                catalog_price,
            )
            raise HTTPException(
                400,
                "Preço inválido. Recarregue a página e tente novamente.",
            )
        expected_total += catalog_price

    if body.total_cents != expected_total:
        log.warning(
            "create-charge: total mismatch: client=%d expected=%d",
            body.total_cents,
            expected_total,
        )
        raise HTTPException(
            400,
            "Total inválido. Recarregue a página e tente novamente.",
        )

    # Verify that an order can be persisted before asking Asaas to create a
    # payable charge. This prevents orphan PIX charges during database outages
    # or account quota restrictions.
    await asyncio.to_thread(_ensure_checkout_storage_available)
    await asyncio.to_thread(_ensure_no_recent_checkout, body.email)

    correlation_id = generate_correlation_id()

    # Clean CPF — remove dots and dashes
    cpf_clean = body.cpf.replace(".", "").replace("-", "").replace(" ", "")

    # Clean phone — keep digits only, ensure +55 prefix
    phone_clean = "".join(c for c in body.whatsapp if c.isdigit())
    if not phone_clean.startswith("55"):
        phone_clean = f"55{phone_clean}"

    # Create charge on Asaas
    charge_result = await asyncio.to_thread(
        create_pix_charge,
        value_cents=body.total_cents,
        correlation_id=correlation_id,
        customer={
            "name": body.name,
            "email": body.email,
            "taxID": cpf_clean,
            "phone": phone_clean,
        },
    )

    if not charge_result.get("ok"):
        raise HTTPException(
            502,
            f"Erro ao criar cobrança PIX: {charge_result.get('error', 'unknown')}",
        )

    # Save order in Supabase
    import json
    from crypto_util import encrypt_text

    # Encrypt CPF for LGPD compliance — never store in plain text
    cpf_encrypted = encrypt_text(cpf_clean) if cpf_clean else ""

    order_data = {
        "correlation_id": correlation_id,
        "customer_name": body.name,
        "customer_email": body.email.strip().lower(),
        "customer_whatsapp": body.whatsapp,
        "customer_cpf": cpf_encrypted,
        "items": json.dumps([item.dict() for item in body.items]),
        "total_cents": body.total_cents,
        "status": "pending",
        # Asaas IDs start with "pay_"; reuse the existing provider ID column
        # so the production cutover does not depend on a schema migration.
        "openpix_charge_id": charge_result.get("charge_id", ""),
        "utm_source": (body.utm_source or "").strip() or None,
        "utm_medium": (body.utm_medium or "").strip() or None,
        "utm_campaign": (body.utm_campaign or "").strip() or None,
        "utm_content": (body.utm_content or "").strip() or None,
        "utm_term": (body.utm_term or "").strip() or None,
        "fbclid": (body.fbclid or "").strip() or None,
        "fbc": (body.fbc or "").strip() or None,
        "fbp": (body.fbp or "").strip() or None,
    }

    from pix_pending_email import send_pix_pending_email

    # Persist before returning: polling and webhooks can arrive immediately
    # after charge creation and fulfillment requires this row to exist.
    try:
        await asyncio.to_thread(
            rest_upsert,
            "orders",
            order_data,
            on_conflict="correlation_id",
        )
    except Exception as exc:
        log.exception("Failed to save order %s", correlation_id)
        raise HTTPException(
            502,
            "Cobrança criada, mas não foi possível registrar o pedido. Contate o suporte.",
        ) from exc

    def _background_work() -> None:
        try:
            send_pix_pending_email(
                to_email=body.email.strip().lower(),
                customer_name=body.name,
                total_cents=body.total_cents,
                items=[item.dict() for item in body.items] if body.items else [{"name": "ClipSaaS — Gerador de Legendas", "price_cents": body.total_cents}],
                br_code=charge_result.get("brCode", ""),
                qr_code_image_url=charge_result.get("qrCodeImage", ""),
                payment_link_url=charge_result.get("paymentLinkUrl", ""),
                correlation_id=correlation_id,
                expires_minutes=5,
            )
        except Exception as e:
            log.warning("Failed to send pix pending email instantly: %s", e)
            
    background_tasks.add_task(_background_work)

    return {
        "ok": True,
        "correlationID": charge_result["correlationID"],
        "qrCodeImage": charge_result["qrCodeImage"],
        "brCode": charge_result["brCode"],
        "paymentLinkUrl": charge_result.get("paymentLinkUrl", ""),
    }


@router.get("/api/checkout/status/{correlation_id}")
async def checkout_charge_status(correlation_id: str, request: Request) -> dict:
    """Check PIX charge payment status; fulfill access when payment completes."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    _rate_limit("checkout-status", _RATE_MAX_STATUS, request)

    order = _get_checkout_order(correlation_id)
    fallback_charge_id = str(order.get("openpix_charge_id") or "") if order else ""
    order_paid = bool(order and order.get("status") == "paid")
    result = _resolve_order_charge_status(
        correlation_id,
        charge_id=fallback_charge_id,
        order_paid=order_paid,
    )
    status = result.get("status", "UNKNOWN")

    fulfillment: dict | None = None
    if status == "COMPLETED":
        fulfillment = _fulfill_if_paid(correlation_id, source="poll")

    return {
        "status": status,
        "correlationID": correlation_id,
        "fulfillment": fulfillment,
    }


@router.post("/api/checkout/fulfill/{correlation_id}")
async def checkout_fulfill(correlation_id: str, request: Request) -> dict:
    """Safety net: activate access after payment (confirmacao page / retries)."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    _rate_limit("checkout-fulfill", _RATE_MAX_CHECKOUT, request)

    order = _get_checkout_order(correlation_id)
    if not order:
        raise HTTPException(404, "Pedido não encontrado")

    fallback_charge_id = str(order.get("openpix_charge_id") or "")
    result = _resolve_order_charge_status(
        correlation_id,
        charge_id=fallback_charge_id,
    )
    status = result.get("status", "UNKNOWN")
    if status != "COMPLETED":
        return {
            "ok": False,
            "status": status,
            "correlationID": correlation_id,
            "reason": "payment_not_completed",
        }

    fulfillment = _fulfill_if_paid(correlation_id, source="confirmacao")
    if not fulfillment or not fulfillment.get("ok"):
        raise HTTPException(
            502,
            fulfillment.get("error") if fulfillment else "Falha ao liberar acesso",
        )
    return {
        "ok": True,
        "status": status,
        "correlationID": correlation_id,
        "fulfillment": fulfillment,
    }


@router.post("/webhooks/cakto")
async def cakto_webhook(_body: CaktoWebhookBody) -> dict:
    """Desativado — webhook Cakto migrado para Supabase Edge Function."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")
    raise HTTPException(
        410,
        detail={
            "message": "Webhook Cakto migrado para Supabase Edge Function.",
        },
    )


@router.post("/webhooks/asaas")
async def asaas_webhook(
    request: Request,
) -> dict:
    """Authenticate Asaas notifications and fulfill received PIX payments."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    expected_token = (os.environ.get("ASAAS_WEBHOOK_TOKEN") or "").strip()
    received_token = (request.headers.get("asaas-access-token") or "").strip()
    if not expected_token or not hmac.compare_digest(received_token, expected_token):
        raise HTTPException(401, "webhook não autorizado")

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(400, "payload inválido") from exc

    event = str(payload.get("event") or "")
    payment = payload.get("payment") or {}
    if event != "PAYMENT_RECEIVED":
        return {"ok": True, "ignored": True, "event": event}

    correlation_id = str(payment.get("externalReference") or "").strip()
    payment_id = str(payment.get("id") or "").strip()
    if not correlation_id or not payment_id:
        raise HTTPException(400, "pagamento sem identificadores")

    order = _get_checkout_order(correlation_id)
    if not order:
        # A retry is desirable if the provider event races order persistence.
        raise HTTPException(503, "pedido ainda não localizado")
    if not hmac.compare_digest(str(order.get("openpix_charge_id") or ""), payment_id):
        log.warning(
            "Asaas webhook payment mismatch: order=%s received=%s",
            correlation_id,
            payment_id,
        )
        raise HTTPException(409, "pagamento não corresponde ao pedido")
    if int(order.get("total_cents") or 0) != round(float(payment.get("value") or 0) * 100):
        log.warning("Asaas webhook value mismatch for order %s", correlation_id)
        raise HTTPException(409, "valor não corresponde ao pedido")

    fulfillment = await asyncio.to_thread(
        _fulfill_if_paid,
        correlation_id,
        source="asaas-webhook",
    )
    if not fulfillment or not fulfillment.get("ok"):
        raise HTTPException(
            503,
            fulfillment.get("error") if fulfillment else "falha ao liberar acesso",
        )
    return {"ok": True, "fulfilled": True}
