"""Checkout PIX via Woovi/OpenPix."""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from typing import Any

import requests

log = logging.getLogger("legendas.checkout")

OPENPIX_API = "https://api.openpix.com.br/api/v1"


def _app_id() -> str:
    return (os.environ.get("OPENPIX_APP_ID") or "").strip()


def _headers() -> dict[str, str]:
    return {
        "Authorization": _app_id(),
        "Content-Type": "application/json",
    }


def create_pix_charge(
    value_cents: int,
    correlation_id: str,
    customer: dict[str, str],
    expires_in: int = 300,
) -> dict[str, Any]:
    """Create a PIX charge via OpenPix API.

    Args:
        value_cents: Amount in cents (e.g. 3700 for R$ 37,00)
        correlation_id: Unique ID for this charge
        customer: dict with keys: name, email, taxID (CPF), phone
        expires_in: Expiration time in seconds (default 5 min)

    Returns:
        dict with: correlationID, qrCodeImage, brCode, paymentLinkUrl, charge_id
    """
    payload: dict[str, Any] = {
        "correlationID": correlation_id,
        "value": value_cents,
        "customer": {
            "name": customer.get("name", ""),
            "email": customer.get("email", ""),
            "taxID": customer.get("taxID", ""),
            "phone": customer.get("phone", ""),
        },
        "expiresIn": expires_in,
    }

    try:
        resp = requests.post(
            f"{OPENPIX_API}/charge",
            headers=_headers(),
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        charge = data.get("charge", {})
        return {
            "ok": True,
            "correlationID": charge.get("correlationID", correlation_id),
            "qrCodeImage": charge.get("qrCodeImage", ""),
            "brCode": charge.get("brCode", ""),
            "paymentLinkUrl": charge.get("paymentLinkUrl", ""),
            "charge_id": charge.get("globalID", ""),
        }
    except requests.exceptions.RequestException as exc:
        log.exception("OpenPix create charge failed")
        error_msg = str(exc)
        if hasattr(exc, "response") and exc.response is not None:
            try:
                error_body = exc.response.json()
                error_msg = error_body.get("error", error_msg)
            except Exception:
                error_msg = exc.response.text[:500]
        return {"ok": False, "error": error_msg}


def get_charge_status(correlation_id: str) -> dict[str, Any]:
    """Check the status of a PIX charge.

    Returns:
        dict with: status (ACTIVE, COMPLETED, EXPIRED)
    """
    try:
        resp = requests.get(
            f"{OPENPIX_API}/charge/{correlation_id}",
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        charge = data.get("charge", {})
        return {
            "ok": True,
            "status": charge.get("status", "UNKNOWN"),
            "correlationID": correlation_id,
        }
    except requests.exceptions.RequestException as exc:
        log.warning("OpenPix get charge status failed for %s: %s", correlation_id, exc)
        return {"ok": False, "error": str(exc), "status": "UNKNOWN"}


def resolve_charge_status(
    correlation_id: str,
    *,
    fallback_charge_id: str | None = None,
    order_paid: bool = False,
) -> dict[str, Any]:
    """Resolve charge status, retrying OpenPix and honoring paid orders."""
    if order_paid:
        return {"ok": True, "status": "COMPLETED", "correlationID": correlation_id, "source": "db"}

    last = {"ok": False, "status": "UNKNOWN", "correlationID": correlation_id}
    ids = [correlation_id]
    fallback = (fallback_charge_id or "").strip()
    if fallback and fallback not in ids:
        ids.append(fallback)

    for charge_id in ids:
        for attempt in range(3):
            result = get_charge_status(charge_id)
            last = result
            if result.get("ok"):
                return result
            if attempt < 2:
                time.sleep(0.4 * (attempt + 1))
    return last


def generate_correlation_id() -> str:
    """Generate a unique correlation ID for a charge."""
    return str(uuid.uuid4())
