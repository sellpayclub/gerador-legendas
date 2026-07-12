"""Meta Conversions API — server-side Purchase events."""
from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from supabase_client import rest_get, rest_patch

log = logging.getLogger("legendas.meta_capi")

GRAPH_API = "https://graph.facebook.com/v21.0"


def _sha256_normalized(value: str) -> str:
    normalized = value.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _sha256_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("55"):
        normalized = digits
    elif digits:
        normalized = f"55{digits}"
    else:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _pixel_id() -> str:
    env_id = (os.environ.get("META_PIXEL_ID") or "").strip()
    if env_id:
        return env_id
    rows = rest_get(
        "global_settings",
        params={"id": "eq.default", "select": "fb_pixel_id"},
    )
    if rows and rows[0].get("fb_pixel_id"):
        return str(rows[0]["fb_pixel_id"]).strip()
    return ""


def _access_token() -> str:
    env_token = (os.environ.get("META_CAPI_ACCESS_TOKEN") or "").strip()
    if env_token:
        return env_token
    rows = rest_get(
        "global_settings",
        params={"id": "eq.default", "select": "meta_capi_token"},
    )
    if rows and rows[0].get("meta_capi_token"):
        return str(rows[0]["meta_capi_token"]).strip()
    return ""


def _event_time_from_order(order: dict[str, Any]) -> int:
    paid_at = order.get("paid_at")
    if paid_at:
        try:
            dt = datetime.fromisoformat(str(paid_at).replace("Z", "+00:00"))
            return int(dt.timestamp())
        except Exception:
            pass
    created = order.get("created_at")
    if created:
        try:
            dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
            return int(dt.timestamp())
        except Exception:
            pass
    return int(time.time())


def _build_event_source_url(order: dict[str, Any]) -> Optional[str]:
    base = (
        (os.environ.get("APP_PUBLIC_URL") or "https://app.clipsaas.site")
        .strip()
        .rstrip("/")
    )
    params: list[str] = []
    for key in (
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
    ):
        val = order.get(key)
        if val:
            params.append(f"{key}={requests.utils.quote(str(val))}")
    fbclid = order.get("fbclid")
    if fbclid:
        params.append(f"fbclid={requests.utils.quote(str(fbclid))}")
    qs = "&".join(params)
    return f"{base}/checkout" + (f"?{qs}" if qs else "")


def send_purchase_from_order(
    order: dict[str, Any],
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Send Meta CAPI Purchase for a paid order. Idempotent via event_id + DB flag."""
    correlation_id = str(order.get("correlation_id") or "").strip()
    if not correlation_id:
        return {"ok": False, "error": "missing correlation_id"}

    if order.get("meta_purchase_sent_at") and not force:
        return {
            "ok": True,
            "skipped": True,
            "reason": "already_sent",
            "correlation_id": correlation_id,
        }

    pixel_id = _pixel_id()
    token = _access_token()
    if not pixel_id:
        return {"ok": False, "error": "META pixel id not configured"}
    if not token:
        return {"ok": False, "error": "META_CAPI_ACCESS_TOKEN not configured"}

    email = str(order.get("customer_email") or "").strip().lower()
    if not email:
        return {"ok": False, "error": "order missing email"}

    total_cents = int(order.get("total_cents") or 0)
    value = round(total_cents / 100, 2)

    user_data: dict[str, Any] = {
        "em": [_sha256_normalized(email)],
    }
    phone_hash = _sha256_phone(str(order.get("customer_whatsapp") or ""))
    if phone_hash:
        user_data["ph"] = [phone_hash]
    fbc = str(order.get("fbc") or "").strip()
    fbp = str(order.get("fbp") or "").strip()
    if fbc:
        user_data["fbc"] = fbc
    if fbp:
        user_data["fbp"] = fbp

    custom_data: dict[str, Any] = {
        "value": value,
        "currency": "BRL",
        "order_id": correlation_id,
    }
    for key in (
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
    ):
        val = order.get(key)
        if val:
            custom_data[key] = str(val)

    event_source_url = _build_event_source_url(order)
    event: dict[str, Any] = {
        "event_name": "Purchase",
        "event_time": _event_time_from_order(order),
        "event_id": correlation_id,
        "action_source": "website",
        "user_data": user_data,
        "custom_data": custom_data,
    }
    if event_source_url:
        event["event_source_url"] = event_source_url

    payload = {"data": [event], "access_token": token}

    try:
        resp = requests.post(
            f"{GRAPH_API}/{pixel_id}/events",
            json=payload,
            timeout=30,
        )
        body = resp.json()
        if resp.status_code >= 400 or body.get("error"):
            err = body.get("error") or body
            log.error("Meta CAPI failed for %s: %s", correlation_id, err)
            return {"ok": False, "error": str(err), "correlation_id": correlation_id}

        events_received = (body.get("events_received") or 0) if isinstance(body, dict) else 0
        if events_received < 1:
            return {
                "ok": False,
                "error": f"events_received={events_received}",
                "correlation_id": correlation_id,
                "response": body,
            }

        rest_patch(
            "orders",
            params={"correlation_id": f"eq.{correlation_id}"},
            body={"meta_purchase_sent_at": datetime.now(timezone.utc).isoformat()},
        )
        log.info("Meta CAPI Purchase sent for %s (%s)", correlation_id, email)
        return {
            "ok": True,
            "correlation_id": correlation_id,
            "email": email,
            "events_received": events_received,
            "fbtrace_id": body.get("fbtrace_id"),
        }
    except requests.RequestException as exc:
        log.exception("Meta CAPI request failed for %s", correlation_id)
        return {"ok": False, "error": str(exc), "correlation_id": correlation_id}
