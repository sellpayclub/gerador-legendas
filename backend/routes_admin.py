"""Admin API routes (hosted mode)."""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from auth import UserContext, get_current_user, require_admin
from cakto_webhook import _activate_purchase
from tenant import is_multi_tenant

log = logging.getLogger("legendas.routes_admin")

router = APIRouter()

PRODUCT_NAME = "ClipSaaS — Gerador de Legendas"


class SendAccessBody(BaseModel):
    email: str
    name: str = ""

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        email = v.strip().lower()
        if not email or "@" not in email or "." not in email.split("@")[-1]:
            raise ValueError("E-mail inválido")
        return email


@router.post("/api/admin/send-access")
async def admin_send_access(
    body: SendAccessBody,
    user: UserContext = Depends(get_current_user),
) -> dict:
    """Create/activate customer and send access email (admin emergency tool)."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")

    await require_admin(user)

    email = body.email.strip().lower()
    name = body.name.strip()
    order_id = f"manual-admin-{uuid.uuid4()}"

    try:
        result = _activate_purchase(
            {
                "customer": {"email": email, "name": name},
                "product": {"name": PRODUCT_NAME},
                "id": order_id,
            }
        )
    except Exception as exc:
        log.exception("admin send-access failed for %s", email)
        raise HTTPException(500, f"Falha ao enviar acesso: {exc}") from exc

    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "Falha ao ativar cliente")

    if not result.get("email_sent"):
        raise HTTPException(
            502,
            result.get("email_error") or "Conta ativada, mas o e-mail não foi enviado.",
        )

    log.info("Admin %s sent access to %s (order=%s)", user.email, email, order_id)
    return {
        "ok": True,
        "email": email,
        "user_id": result.get("user_id"),
        "email_sent": True,
        "email_id": result.get("email_id"),
        "access_link_generated": result.get("access_link_generated"),
    }
