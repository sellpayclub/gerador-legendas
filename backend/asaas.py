"""Checkout PIX through the Asaas API."""
from __future__ import annotations

import base64
import logging
import os
from datetime import date
from typing import Any

import requests

log = logging.getLogger("legendas.asaas")


def _base_url() -> str:
    environment = (os.environ.get("ASAAS_ENVIRONMENT") or "sandbox").strip().lower()
    if environment == "production":
        return "https://api.asaas.com/v3"
    return "https://api-sandbox.asaas.com/v3"


def _headers() -> dict[str, str]:
    return {
        "access_token": (os.environ.get("ASAAS_API_KEY") or "").strip(),
        "Content-Type": "application/json",
        "User-Agent": "ClipSaaS/1.0 (Python; checkout)",
    }


def _error_message(response: requests.Response) -> str:
    try:
        data = response.json()
        errors = data.get("errors") or []
        if errors:
            return "; ".join(str(item.get("description") or item.get("code") or "") for item in errors)
        return str(data.get("error") or data)
    except Exception:
        return response.text[:500]


def _request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    if not _headers()["access_token"]:
        raise RuntimeError("ASAAS_API_KEY não configurada")
    response = requests.request(
        method,
        f"{_base_url()}{path}",
        headers=_headers(),
        timeout=30,
        **kwargs,
    )
    if not response.ok:
        raise RuntimeError(f"Asaas HTTP {response.status_code}: {_error_message(response)}")
    return response.json()


def _find_or_create_customer(
    *,
    name: str,
    email: str,
    cpf: str,
    phone: str,
    external_reference: str,
) -> str:
    existing = _request("GET", "/customers", params={"cpfCnpj": cpf, "limit": 1})
    customers = existing.get("data") or []
    if customers:
        return str(customers[0]["id"])

    customer = _request(
        "POST",
        "/customers",
        json={
            "name": name,
            "email": email,
            "cpfCnpj": cpf,
            "mobilePhone": phone,
            "externalReference": external_reference,
            # ClipSaaS already sends its own transactional messages.
            "notificationDisabled": True,
        },
    )
    return str(customer["id"])


def create_pix_charge(
    value_cents: int,
    correlation_id: str,
    customer: dict[str, str],
    expires_in: int = 300,
) -> dict[str, Any]:
    """Create an Asaas customer/payment and return the existing checkout shape."""
    del expires_in  # Asaas dynamic PIX uses the charge due date/QR expiration.
    try:
        customer_id = _find_or_create_customer(
            name=customer.get("name", ""),
            email=customer.get("email", ""),
            cpf=customer.get("taxID", ""),
            phone=customer.get("phone", ""),
            external_reference=f"clipsaas-customer-{correlation_id}",
        )
        payment = _request(
            "POST",
            "/payments",
            json={
                "customer": customer_id,
                "billingType": "PIX",
                "value": value_cents / 100,
                "dueDate": date.today().isoformat(),
                "description": "ClipSaaS — Gerador de Legendas",
                "externalReference": correlation_id,
            },
        )
        payment_id = str(payment["id"])
        qr = _request("GET", f"/payments/{payment_id}/pixQrCode")
        encoded_image = str(qr.get("encodedImage") or "")
        qr_image = f"data:image/png;base64,{encoded_image}" if encoded_image else ""
        # Reject malformed provider output before returning it to the browser.
        if encoded_image:
            base64.b64decode(encoded_image, validate=True)
        return {
            "ok": True,
            "correlationID": correlation_id,
            "qrCodeImage": qr_image,
            "brCode": str(qr.get("payload") or ""),
            "paymentLinkUrl": str(payment.get("invoiceUrl") or ""),
            "charge_id": payment_id,
            "customer_id": customer_id,
        }
    except Exception as exc:
        log.exception("Asaas create charge failed")
        return {"ok": False, "error": str(exc)}


def get_charge_status(payment_id: str) -> dict[str, Any]:
    try:
        payment = _request("GET", f"/payments/{payment_id}")
        asaas_status = str(payment.get("status") or "UNKNOWN")
        if asaas_status in {"RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"}:
            status = "COMPLETED"
        elif asaas_status in {"OVERDUE", "REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"}:
            status = "EXPIRED"
        else:
            status = "ACTIVE"
        return {
            "ok": True,
            "status": status,
            "providerStatus": asaas_status,
            "paymentID": payment_id,
        }
    except Exception as exc:
        log.warning("Asaas get charge status failed for %s: %s", payment_id, exc)
        return {"ok": False, "error": str(exc), "status": "UNKNOWN"}


def resolve_charge_status(
    correlation_id: str,
    *,
    fallback_charge_id: str | None = None,
    order_paid: bool = False,
) -> dict[str, Any]:
    if order_paid:
        return {"ok": True, "status": "COMPLETED", "correlationID": correlation_id, "source": "db"}
    payment_id = (fallback_charge_id or "").strip()
    if not payment_id:
        return {"ok": False, "status": "UNKNOWN", "correlationID": correlation_id}
    result = get_charge_status(payment_id)
    result["correlationID"] = correlation_id
    return result

