"""E-mail transacional com PIX pendente do checkout."""
from __future__ import annotations

import html
import logging
import os
import time
from typing import Any, Optional

log = logging.getLogger("legendas.pix_pending_email")


def _from_email() -> str:
    raw = (os.environ.get("RESEND_FROM_EMAIL") or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        raw = raw[1:-1].strip()
    return raw


def _checkout_url() -> str:
    base = (
        os.environ.get("APP_PUBLIC_URL")
        or os.environ.get("PUBLIC_DOMAIN")
        or "https://app.clipsaas.site"
    ).strip().rstrip("/")
    return f"{base}/checkout"


def _format_brl(cents: int) -> str:
    return f"R$ {cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _build_items_html(items: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for item in items:
        name = html.escape(str(item.get("name") or "Item"))
        price = _format_brl(int(item.get("price_cents") or 0))
        rows.append(
            f'<tr><td style="padding:8px 0;color:#d4d4d8;font-size:14px">{name}</td>'
            f'<td style="padding:8px 0;color:#fafafa;font-size:14px;text-align:right;font-weight:600">{price}</td></tr>'
        )
    if not rows:
        return ""
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="margin:0 0 20px;border-collapse:collapse">'
        + "".join(rows)
        + "</table>"
    )


def _build_html(
    *,
    customer_name: str,
    total_cents: int,
    items: list[dict[str, Any]],
    br_code: str,
    qr_code_image_url: str,
    payment_link_url: str,
    expires_minutes: int,
    checkout_url: str,
) -> str:
    greeting = html.escape(customer_name.strip() or "cliente")
    total = _format_brl(total_cents)
    items_html = _build_items_html(items)
    safe_br = html.escape(br_code)
    safe_qr = html.escape(qr_code_image_url)
    safe_link = html.escape(payment_link_url)
    safe_checkout = html.escape(checkout_url)

    pay_button = ""
    if payment_link_url:
        pay_button = f"""
        <p style="margin:0 0 24px;text-align:center">
          <a href="{safe_link}"
             style="display:inline-block;background:#22c55e;color:#fff;padding:16px 32px;
                    border-radius:12px;font-weight:700;text-decoration:none;font-size:17px">
            Pagar com PIX
          </a>
        </p>
        """

    qr_block = ""
    if qr_code_image_url:
        qr_block = f"""
        <div style="text-align:center;margin:0 0 20px">
          <p style="margin:0 0 12px;font-size:14px;color:#a1a1aa">Escaneie o QR Code no app do seu banco</p>
          <img src="{safe_qr}" alt="QR Code PIX" width="220" height="220"
               style="display:block;margin:0 auto;border-radius:12px;background:#fff;padding:8px" />
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#fafafa;
             margin:0;padding:32px 16px">
  <div style="max-width:560px;margin:0 auto;background:#18181b;border-radius:16px;
              padding:32px 24px;border:1px solid #27272a">
    <h1 style="margin:0 0 8px;font-size:24px">Seu PIX está pronto</h1>
    <p style="color:#a1a1aa;margin:0 0 20px;line-height:1.5">
      Olá, {greeting}! Finalize o pagamento do <strong style="color:#fafafa">ClipSaaS</strong>
      em até <strong style="color:#facc15">{expires_minutes} minutos</strong>.
    </p>

    <div style="background:#27272a;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #3f3f46">
      <p style="margin:0 0 12px;font-size:13px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em">
        Resumo do pedido
      </p>
      {items_html}
      <p style="margin:0;font-size:18px;font-weight:700;color:#fafafa;text-align:right">
        Total: {total}
      </p>
    </div>

    {pay_button}
    {qr_block}

    <div style="background:#1c1917;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #3f3f46">
      <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;font-weight:600">PIX Copia e Cola</p>
      <p style="margin:0;font-size:11px;line-height:1.6;word-break:break-all;color:#e4e4e7;
                font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#09090b;
                padding:12px;border-radius:8px">{safe_br}</p>
    </div>

    <p style="font-size:13px;color:#a1a1aa;line-height:1.6;margin:0 0 16px">
      Se o PIX expirar, volte ao checkout e gere um novo código:
      <a href="{safe_checkout}" style="color:#facc15">{safe_checkout}</a>
    </p>
    <p style="font-size:12px;color:#71717a;line-height:1.5;margin:0">
      Após o pagamento, você receberá outro e-mail com login e senha de acesso à plataforma.
    </p>
  </div>
</body>
</html>"""


def send_pix_pending_email(
    *,
    to_email: str,
    customer_name: str,
    total_cents: int,
    items: list[dict[str, Any]],
    br_code: str,
    qr_code_image_url: str,
    payment_link_url: str,
    correlation_id: str,
    expires_minutes: int = 5,
) -> dict[str, object]:
    """Send PIX pending email via Resend. Never raises — returns {ok, email_id?, error?}."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    from_email = _from_email()
    if not api_key:
        log.warning("RESEND_API_KEY não configurada — e-mail PIX não enviado.")
        return {"ok": False, "error": "RESEND_API_KEY não configurada"}
    if not from_email:
        log.warning("RESEND_FROM_EMAIL não configurado — e-mail PIX não enviado.")
        return {"ok": False, "error": "RESEND_FROM_EMAIL não configurado"}
    if not br_code.strip():
        return {"ok": False, "error": "br_code vazio"}

    checkout_url = _checkout_url()
    total_label = _format_brl(total_cents)
    html_body = _build_html(
        customer_name=customer_name,
        total_cents=total_cents,
        items=items,
        br_code=br_code,
        qr_code_image_url=qr_code_image_url,
        payment_link_url=payment_link_url,
        expires_minutes=expires_minutes,
        checkout_url=checkout_url,
    )

    payload: dict[str, Any] = {
        "from": from_email,
        "to": [to_email.strip().lower()],
        "subject": f"Seu PIX ClipSaaS — {total_label} (válido por {expires_minutes} min)",
        "html": html_body,
    }

    import resend

    resend.api_key = api_key
    options = {"idempotency_key": f"pix-pending/{correlation_id}"}
    last_error = "erro desconhecido"
    for attempt in range(3):
        try:
            result = resend.Emails.send(payload, options=options)
            if isinstance(result, dict) and result.get("error"):
                err = result["error"]
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                log.error("Resend PIX email error for %s: %s", to_email, msg)
                return {"ok": False, "error": msg}
            email_id: Optional[str] = None
            if isinstance(result, dict):
                data = result.get("data") or result
                if isinstance(data, dict):
                    email_id = data.get("id")
            log.info("PIX pending email sent to %s (id=%s, correlation=%s)", to_email, email_id, correlation_id)
            return {"ok": True, "email_id": email_id}
        except Exception as exc:
            last_error = str(exc)
            log.warning(
                "PIX email attempt %d/3 failed for %s: %s",
                attempt + 1, to_email, exc,
            )
            if attempt < 2:
                time.sleep(0.8 * (attempt + 1))
    log.error("Failed to send PIX pending email to %s after retries", to_email)
    return {"ok": False, "error": last_error}
