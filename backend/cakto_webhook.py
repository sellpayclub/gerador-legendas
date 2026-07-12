"""Cakto payment webhooks — activate access and send login + manual via Resend."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from typing import Any, Optional

from purchase_email import send_purchase_approved_email
from supabase_client import (
    auth_admin_create_user,
    auth_admin_generate_link,
    auth_admin_update_user,
    rest_get,
    rest_patch,
)

log = logging.getLogger("legendas.cakto")

ACTIVATE_EVENTS = {"purchase_approved", "subscription_renewed", "subscription_created"}
DEACTIVATE_EVENTS = {"subscription_canceled", "refund", "chargeback", "chargedback"}


def _webhook_secret() -> str:
    return (os.environ.get("CAKTO_WEBHOOK_SECRET") or "").strip()


def validate_secret(secret: str) -> bool:
    expected = _webhook_secret()
    if not expected:
        log.warning("CAKTO_WEBHOOK_SECRET não configurado — webhook rejeitado.")
        return False
    received = (secret or "").strip()
    if hmac.compare_digest(received, expected):
        return True
    log.warning(
        "Cakto webhook secret inválido (received_len=%s expected_len=%s)",
        len(received),
        len(expected),
    )
    return False


def _extract_email(data: dict[str, Any]) -> Optional[str]:
    customer = data.get("customer")
    if isinstance(customer, dict):
        email = customer.get("email")
        if email:
            return str(email).strip().lower()
    for key in ("buyer", "client"):
        block = data.get(key)
        if isinstance(block, dict):
            email = block.get("email") or block.get("Email")
            if email:
                return str(email).strip().lower()
    email = data.get("email")
    return str(email).strip().lower() if email else None


def _extract_customer_name(data: dict[str, Any]) -> str:
    customer = data.get("customer")
    if isinstance(customer, dict):
        name = customer.get("name") or customer.get("full_name")
        if name:
            return str(name).strip()
    return ""


def _extract_product_name(data: dict[str, Any]) -> str:
    product = data.get("product")
    if isinstance(product, dict):
        name = product.get("name")
        if name:
            return str(name).strip()
    offer = data.get("offer")
    if isinstance(offer, dict) and offer.get("name"):
        return str(offer["name"]).strip()
    return "Gerador de Legendas"


def _extract_order_id(data: dict[str, Any]) -> str:
    for key in ("id", "refId", "checkout"):
        val = data.get(key)
        if val is not None:
            return str(val)
    return "unknown"


def _find_user_id_by_email(email: str) -> Optional[str]:
    rows = rest_get("profiles", params={"email": f"eq.{email}", "select": "id"})
    if rows:
        return str(rows[0]["id"])
    return None


def _generate_customer_password() -> str:
    """Generate a cryptographically secure random password (24 bytes, URL-safe)."""
    return secrets.token_urlsafe(24)


def _ensure_user_with_password(email: str, order_id: str) -> tuple[str, str | None, bool]:
    """Activate a user account without resetting existing passwords.

    Returns (user_id, password, created):
      - created=True: brand-new user, password was just generated.
      - created=False: existing user, password is None (kept as-is).
    """
    uid = _find_user_id_by_email(email)
    if uid:
        # Usuário já existe — NÃO mexemos na senha dele.
        return uid, None, False
    password = _generate_customer_password()
    created = auth_admin_create_user(email, password=password)
    new_uid = str(created.get("id") or created.get("user", {}).get("id"))
    return new_uid, password, True


def _set_access(
    user_id: str,
    email: str,
    active: bool,
    *,
    plan_name: Optional[str] = None,
    cakto_order_id: Optional[str] = None,
) -> None:
    body: dict[str, Any] = {"access_active": active, "email": email}
    if plan_name:
        body["plan_name"] = plan_name
    if cakto_order_id:
        body["cakto_customer_id"] = cakto_order_id
    rest_patch("profiles", params={"id": f"eq.{user_id}"}, body=body)


def _auth_callback_url() -> str:
    base = (
        (os.environ.get("APP_PUBLIC_URL") or os.environ.get("PUBLIC_DOMAIN") or "")
        .strip()
        .rstrip("/")
    )
    if not base:
        base = "https://app.clipsaas.site"
    return f"{base}/auth/callback"


def _normalize_magic_link(action_link: str) -> str:
    from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

    callback = _auth_callback_url()
    try:
        parsed = urlparse(action_link)
        qs = parse_qs(parsed.query, keep_blank_values=True)
        qs["redirect_to"] = [callback]
        new_query = urlencode(qs, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    except Exception:
        return action_link


def _generate_access_link(email: str) -> Optional[str]:
    try:
        result = auth_admin_generate_link(
            email,
            link_type="magiclink",
            redirect_to=_auth_callback_url(),
        )
        props = result.get("properties") or result
        raw = props.get("action_link") or props.get("email_otp")
        return _normalize_magic_link(str(raw)) if raw else None
    except Exception as exc:
        log.warning("magic link failed for %s: %s", email, exc)
        return None


def _activate_purchase(data: dict[str, Any]) -> dict[str, Any]:
    email = _extract_email(data)
    if not email:
        return {"ok": False, "error": "email não encontrado no payload"}

    customer_name = _extract_customer_name(data)
    product_name = _extract_product_name(data)
    order_id = _extract_order_id(data)

    user_id, login_password, is_new_user = _ensure_user_with_password(email, order_id)
    _set_access(
        user_id,
        email,
        True,
        plan_name=product_name,
        cakto_order_id=order_id,
    )

    access_link = _generate_access_link(email)
    email_result = send_purchase_approved_email(
        to_email=email,
        customer_name=customer_name,
        product_name=product_name,
        access_link=access_link,
        login_password=login_password,
        is_new_user=is_new_user,
        order_id=order_id,
    )
    if not email_result.get("ok"):
        log.error(
            "Falha ao enviar e-mail de acesso para %s (order=%s): %s",
            email,
            order_id,
            email_result.get("error"),
        )
    else:
        log.info(
            "Compra ativada para %s — e-mail enviado (id=%s)",
            email,
            email_result.get("email_id"),
        )

    return {
        "ok": True,
        "user_id": user_id,
        "email": email,
        "order_id": order_id,
        "access_link_generated": bool(access_link),
        "email_sent": email_result.get("ok"),
        "email_id": email_result.get("email_id"),
        "email_error": email_result.get("error"),
    }


def handle_event(event: str, data: dict[str, Any]) -> dict[str, Any]:
    if event in ACTIVATE_EVENTS:
        return _activate_purchase(data)

    email = _extract_email(data)
    if event in DEACTIVATE_EVENTS:
        if not email:
            return {"ok": False, "error": "email não encontrado no payload"}
        user_id = _find_user_id_by_email(email)
        if user_id:
            _set_access(user_id, email, False)
        return {"ok": True, "deactivated": True, "email": email}

    return {"ok": True, "ignored": event}
