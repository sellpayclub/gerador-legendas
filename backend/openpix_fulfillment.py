"""Fulfill checkout PIX orders — activate access and send purchase email."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from cakto_webhook import _activate_purchase, _find_user_id_by_email
from meta_capi import send_purchase_from_order
from supabase_client import rest_get, rest_patch, rest_upsert

log = logging.getLogger("legendas.pix_fulfillment")

PRODUCT_NAME = "ClipSaaS — Gerador de Legendas"


def _get_order(correlation_id: str) -> Optional[dict[str, Any]]:
    rows = rest_get(
        "orders",
        params={"correlation_id": f"eq.{correlation_id}", "select": "*"},
    )
    return rows[0] if rows else None


def _mark_order_paid(correlation_id: str) -> None:
    rest_patch(
        "orders",
        params={"correlation_id": f"eq.{correlation_id}"},
        body={
            "status": "paid",
            "paid_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def _log_webhook_event(
    *,
    correlation_id: str,
    email: str,
    status: str,
    email_id: Optional[str],
    error_message: Optional[str],
    payload: dict[str, Any],
) -> None:
    try:
        rest_upsert(
            "webhook_events",
            {
                "order_id": f"pix-{correlation_id}",
                "event": "PIX:PAYMENT_RECEIVED",
                "email": email,
                "status": status,
                "email_id": email_id,
                "error_message": error_message,
                "payload": payload,
            },
            on_conflict="order_id",
        )
    except Exception as exc:
        log.warning("webhook_events upsert failed for %s: %s", correlation_id, exc)


def fulfill_openpix_order(
    correlation_id: str,
    *,
    source: str = "poll",
    force_resend: bool = False,
) -> dict[str, Any]:
    """Activate access for a paid PIX order. Idempotent when already fulfilled."""
    order = _get_order(correlation_id)
    if not order:
        return {"ok": False, "error": "order not found", "correlation_id": correlation_id}

    email = str(order.get("customer_email") or "").strip().lower()
    if not email:
        return {"ok": False, "error": "order missing email", "correlation_id": correlation_id}

    user_id = _find_user_id_by_email(email)
    already_paid = order.get("status") == "paid"
    already_active = False
    if user_id:
        profiles = rest_get(
            "profiles",
            params={"id": f"eq.{user_id}", "select": "access_active"},
        )
        already_active = bool(profiles and profiles[0].get("access_active"))

    if already_paid and already_active and not force_resend:
        meta_result = send_purchase_from_order(order)
        return {
            "ok": True,
            "already_fulfilled": True,
            "correlation_id": correlation_id,
            "email": email,
            "user_id": user_id,
            "meta_capi": meta_result,
        }

    if already_active and not force_resend:
        if not already_paid:
            _mark_order_paid(correlation_id)
            order = _get_order(correlation_id) or order
        meta_result = send_purchase_from_order(order)
        return {
            "ok": True,
            "already_fulfilled": True,
            "order_marked_paid": not already_paid,
            "correlation_id": correlation_id,
            "email": email,
            "user_id": user_id,
            "meta_capi": meta_result,
        }

    if not already_paid:
        _mark_order_paid(correlation_id)

    activation_data = {
        "customer": {
            "email": email,
            "name": str(order.get("customer_name") or "").strip(),
        },
        "product": {"name": PRODUCT_NAME},
        "id": correlation_id,
    }
    result = _activate_purchase(activation_data)

    meta_result = send_purchase_from_order(order)
    if not meta_result.get("ok") and not meta_result.get("skipped"):
        log.warning(
            "Meta CAPI Purchase failed for %s: %s",
            correlation_id,
            meta_result.get("error"),
        )

    _log_webhook_event(
        correlation_id=correlation_id,
        email=email,
        status="ok" if result.get("email_sent") else "error",
        email_id=str(result.get("email_id") or "") or None,
        error_message=str(result.get("email_error") or "") or None,
        payload={"source": source, "correlation_id": correlation_id},
    )

    return {
        **result,
        "correlation_id": correlation_id,
        "source": source,
        "meta_capi": meta_result,
    }
