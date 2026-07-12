"""Hosted mode API routes (/api/me, Cakto webhook)."""
from __future__ import annotations

import logging
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import app_settings
from auth import UserContext, get_current_user, require_user
from checkout import create_pix_charge, generate_correlation_id, resolve_charge_status
from openpix_fulfillment import fulfill_openpix_order
from openai_chat import build_chat_payload
from supabase_client import rest_get, rest_upsert
from tenant import is_multi_tenant
from user_secrets import save_user_openai_key, user_has_openai_key

log = logging.getLogger("legendas.routes_me")

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
    return {
        "user_id": u.user_id,
        "email": u.email,
        "access_active": u.access_active,
        "openai_configured": user_has_openai_key(u.user_id),
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
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "openai_configured": True}


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


# ── Checkout PIX (OpenPix) ────────────────────────────────────────


def _get_checkout_order(correlation_id: str) -> dict | None:
    rows = rest_get(
        "orders",
        params={"correlation_id": f"eq.{correlation_id}", "select": "*"},
    )
    return rows[0] if rows else None


def _fulfill_if_paid(correlation_id: str, *, source: str) -> dict | None:
    try:
        return fulfill_openpix_order(correlation_id, source=source)
    except Exception as exc:
        log.exception("OpenPix fulfillment failed for %s", correlation_id)
        return {"ok": False, "error": str(exc)}


@router.post("/api/checkout/create-charge")
async def create_checkout_charge(body: CreateChargeBody) -> dict:
    """Create a PIX charge via OpenPix and save the order."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    correlation_id = generate_correlation_id()

    # Clean CPF — remove dots and dashes
    cpf_clean = body.cpf.replace(".", "").replace("-", "").replace(" ", "")

    # Clean phone — keep digits only, ensure +55 prefix
    phone_clean = "".join(c for c in body.whatsapp if c.isdigit())
    if not phone_clean.startswith("55"):
        phone_clean = f"55{phone_clean}"

    import asyncio

    # Create charge on OpenPix
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

    order_data = {
        "correlation_id": correlation_id,
        "customer_name": body.name,
        "customer_email": body.email.strip().lower(),
        "customer_whatsapp": body.whatsapp,
        "customer_cpf": cpf_clean,
        "items": json.dumps([item.dict() for item in body.items]),
        "total_cents": body.total_cents,
        "status": "pending",
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

    try:
        await asyncio.to_thread(rest_upsert, "orders", order_data, on_conflict="correlation_id")
    except Exception as exc:
        log.warning("Failed to save order %s: %s", correlation_id, exc)

    from pix_pending_email import send_pix_pending_email

    def _send_email() -> None:
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
            
    asyncio.create_task(asyncio.to_thread(_send_email))

    return {
        "ok": True,
        "correlationID": charge_result["correlationID"],
        "qrCodeImage": charge_result["qrCodeImage"],
        "brCode": charge_result["brCode"],
        "paymentLinkUrl": charge_result.get("paymentLinkUrl", ""),
    }


@router.get("/api/checkout/status/{correlation_id}")
async def checkout_charge_status(correlation_id: str) -> dict:
    """Check PIX charge payment status; fulfill access when payment completes."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    order = _get_checkout_order(correlation_id)
    fallback_charge_id = str(order.get("openpix_charge_id") or "") if order else ""
    order_paid = bool(order and order.get("status") == "paid")
    result = resolve_charge_status(
        correlation_id,
        fallback_charge_id=fallback_charge_id or None,
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
async def checkout_fulfill(correlation_id: str) -> dict:
    """Safety net: activate access after payment (confirmacao page / retries)."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    order = _get_checkout_order(correlation_id)
    if not order:
        raise HTTPException(404, "Pedido não encontrado")

    fallback_charge_id = str(order.get("openpix_charge_id") or "")
    result = resolve_charge_status(
        correlation_id,
        fallback_charge_id=fallback_charge_id or None,
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
