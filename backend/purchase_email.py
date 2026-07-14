"""E-mail de compra aprovada (Resend) com link de acesso e manual PDF."""
from __future__ import annotations

import base64
import logging
import os
import time
from pathlib import Path
from typing import Optional

log = logging.getLogger("legendas.purchase_email")

_MANUAL_PDF = (
    Path(__file__).resolve().parent / "assets" / "Manual_Instalacao_Gerador_Legendas.pdf"
)
_EBOOK_PDF = (
    Path(__file__).resolve().parent / "assets" / "Guia_Cortes_Virais_Lucrativos.pdf"
)


def _pdf_attachment(path: Path, filename: str) -> Optional[dict[str, str]]:
    if not path.is_file():
        log.warning("PDF não encontrado: %s", path)
        return None
    content = base64.b64encode(path.read_bytes()).decode("ascii")
    return {"filename": filename, "content": content}


def _purchase_attachments() -> Optional[list[dict[str, str]]]:
    attachments: list[dict[str, str]] = []
    for path, filename in (
        (_MANUAL_PDF, "Manual_Instalacao_Gerador_Legendas.pdf"),
        (_EBOOK_PDF, "Guia_Cortes_Virais_Lucrativos.pdf"),
    ):
        item = _pdf_attachment(path, filename)
        if item:
            attachments.append(item)
    return attachments or None


def _from_email() -> str:
    raw = (os.environ.get("RESEND_FROM_EMAIL") or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        raw = raw[1:-1].strip()
    return raw


def _app_url() -> str:
    return (os.environ.get("APP_PUBLIC_URL") or os.environ.get("PUBLIC_DOMAIN") or "").strip().rstrip("/")


def _build_html(
    *,
    customer_name: str,
    customer_email: str,
    product_name: str,
    access_link: Optional[str],
    login_url: str,
    login_password: Optional[str],
    is_new_user: bool,
) -> str:
    greeting = customer_name.strip() or "cliente"
    quick_access = ""
    if access_link:
        quick_access = f"""
        <p style="margin:16px 0 0;font-size:13px;color:#86efac;line-height:1.5">
          Prefere entrar com um clique?
          <a href="{access_link}" style="color:#facc15">Acesso rápido (link direto)</a>
        </p>
        """

    if is_new_user:
        credentials_block = f"""
      <p style="margin:0 0 8px;font-size:14px;color:#fafafa"><strong>Login (e-mail):</strong> {customer_email}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#fafafa"><strong>Senha:</strong> {login_password}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#fafafa"><strong>Entrar em:</strong> {login_url}</p>
      <p style="margin:0">
        <a href="{login_url}"
           style="display:inline-block;background:#facc15;color:#09090b;padding:14px 28px;
                  border-radius:10px;font-weight:700;text-decoration:none;font-size:16px">
          Entrar na plataforma
        </a>
      </p>
      {quick_access}
      <p style="margin:16px 0 0;font-size:12px;color:#86efac;line-height:1.5">
        Guarde esta senha. Você pode trocá-la depois em <strong>Configurações → Conta e senha</strong>.
      </p>
        """
    else:
        credentials_block = f"""
      <p style="margin:0 0 8px;font-size:14px;color:#fafafa"><strong>Login (e-mail):</strong> {customer_email}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#fafafa"><strong>Senha:</strong> a mesma que você já usa na plataforma.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#fafafa"><strong>Entrar em:</strong> {login_url}</p>
      <p style="margin:0">
        <a href="{login_url}"
           style="display:inline-block;background:#facc15;color:#09090b;padding:14px 28px;
                  border-radius:10px;font-weight:700;text-decoration:none;font-size:16px">
          Entrar na plataforma
        </a>
      </p>
      {quick_access}
      <p style="margin:16px 0 0;font-size:12px;color:#86efac;line-height:1.5">
        Sua senha não foi alterada. Se esqueceu, use <strong>Esqueci minha senha</strong> na tela de login.
      </p>
        """

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#fafafa;
             margin:0;padding:32px 16px">
  <div style="max-width:600px;margin:0 auto;background:#18181b;border-radius:16px;
              padding:32px;border:1px solid #27272a">
    <h1 style="margin:0 0 8px;font-size:26px">Compra aprovada!</h1>
    <p style="color:#a1a1aa;margin:0 0 24px;line-height:1.5">
      Olá, {greeting}! Seu acesso ao <strong style="color:#fafafa">{product_name}</strong> foi liberado.
    </p>

    <div style="background:#14532d;border-radius:12px;padding:24px;margin-bottom:24px;border:2px solid #22c55e">
      <p style="margin:0 0 16px;font-size:13px;color:#86efac;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">
        Seus dados de acesso
      </p>
      {credentials_block}
    </div>

    <div style="background:#27272a;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #3f3f46">
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#fafafa">Como começar</p>
      <ol style="margin:0;padding-left:20px;color:#d4d4d8;line-height:1.8;font-size:14px">
        <li>Acesse <strong>{login_url}</strong> com o e-mail e senha acima</li>
        <li>Vá em <strong>Configurações</strong> e cadastre sua chave OpenAI</li>
        <li>Envie seu vídeo e gere legendas ou cortes virais</li>
      </ol>
    </div>

    <hr style="border:none;border-top:1px solid #3f3f46;margin:28px 0">
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6">
      Anexamos o <strong style="color:#fafafa">Manual de Instalação</strong> (PDF) com o passo a passo
      completo para usar o Gerador de Legendas, e o bônus
      <strong style="color:#fafafa">Guia: Como Ganhar Dinheiro com Cortes Virais</strong> (ebook em PDF).
    </p>
    <p style="font-size:12px;color:#71717a;margin-top:24px">
      Dúvidas? Responda este e-mail ou fale com nosso suporte.
    </p>
  </div>
</body>
</html>"""


def send_purchase_approved_email(
    *,
    to_email: str,
    customer_name: str,
    product_name: str,
    access_link: Optional[str],
    login_password: Optional[str],
    order_id: str,
    is_new_user: bool = True,
) -> dict[str, object]:
    """Send purchase confirmation via Resend. Returns {ok, email_id?, error?}."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    from_email = _from_email()
    if not api_key:
        log.warning("RESEND_API_KEY não configurada — e-mail não enviado.")
        return {"ok": False, "error": "RESEND_API_KEY não configurada"}
    if not from_email:
        log.warning("RESEND_FROM_EMAIL não configurado — e-mail não enviado.")
        return {"ok": False, "error": "RESEND_FROM_EMAIL não configurado"}

    login_url = f"{_app_url()}/login" if _app_url() else "https://app.clipsaas.site/login"
    html = _build_html(
        customer_name=customer_name,
        customer_email=to_email,
        product_name=product_name,
        access_link=access_link,
        login_url=login_url,
        login_password=login_password,
        is_new_user=is_new_user,
    )

    payload: dict = {
        "from": from_email,
        "to": [to_email],
        "subject": f"Acesso liberado — {product_name}",
        "html": html,
    }
    attachments = _purchase_attachments()
    if attachments:
        payload["attachments"] = attachments

    import resend

    resend.api_key = api_key
    options = {"idempotency_key": f"purchase-approved/{order_id}"}
    last_error = "erro desconhecido"
    for attempt in range(3):
        try:
            result = resend.Emails.send(payload, options=options)
            if isinstance(result, dict) and result.get("error"):
                err = result["error"]
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                log.error("Resend error for %s: %s", to_email, msg)
                return {"ok": False, "error": msg}
            email_id = None
            if isinstance(result, dict):
                data = result.get("data") or result
                if isinstance(data, dict):
                    email_id = data.get("id")
            log.info("Purchase email sent to %s (id=%s)", to_email, email_id)
            return {"ok": True, "email_id": email_id}
        except Exception as exc:
            last_error = str(exc)
            log.warning(
                "Purchase email attempt %d/3 failed for %s: %s",
                attempt + 1, to_email, exc,
            )
            if attempt < 2:
                time.sleep(0.8 * (attempt + 1))
    log.error("Failed to send purchase email to %s after retries", to_email)
    return {"ok": False, "error": last_error}
