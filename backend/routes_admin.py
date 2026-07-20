"""Admin API routes (hosted mode)."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from auth import UserContext, get_current_user, require_admin
from cakto_webhook import _activate_purchase
from supabase_client import rest_get
from tenant import is_multi_tenant

log = logging.getLogger("legendas.routes_admin")

router = APIRouter()

PRODUCT_NAME = "ClipSaaS — Gerador de Legendas"
BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")


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


def _parse_order_date(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(BRAZIL_TZ)
    except (TypeError, ValueError):
        return None


def _sales_dashboard(rows: list[dict]) -> dict:
    """Build admin-only sales metrics from paid checkout orders."""
    now = datetime.now(BRAZIL_TZ)
    current_month = (now.year, now.month)
    paid = [row for row in rows if str(row.get("status") or "").lower() == "paid"]

    total_cents = 0
    month_cents = 0
    month_count = 0
    year_cents = 0
    clients: dict[str, dict] = {}
    monthly: dict[tuple[int, int], dict] = {}

    for row in paid:
        cents = max(0, int(row.get("total_cents") or 0))
        paid_at = _parse_order_date(row.get("paid_at") or row.get("created_at"))
        total_cents += cents

        if paid_at:
            month_key = (paid_at.year, paid_at.month)
            bucket = monthly.setdefault(month_key, {"revenue_cents": 0, "sales_count": 0})
            bucket["revenue_cents"] += cents
            bucket["sales_count"] += 1
            if paid_at.year == now.year:
                year_cents += cents
            if month_key == current_month:
                month_cents += cents
                month_count += 1

        email = str(row.get("customer_email") or "").strip().lower()
        key = email or str(row.get("correlation_id") or uuid.uuid4())
        client = clients.setdefault(
            key,
            {
                "name": str(row.get("customer_name") or "Cliente").strip() or "Cliente",
                "email": email,
                "whatsapp": str(row.get("customer_whatsapp") or "").strip(),
                "purchases_count": 0,
                "total_cents": 0,
                "last_paid_at": None,
            },
        )
        client["purchases_count"] += 1
        client["total_cents"] += cents
        if paid_at and (not client["last_paid_at"] or paid_at.isoformat() > client["last_paid_at"]):
            client["last_paid_at"] = paid_at.isoformat()

    series: list[dict] = []
    year, month = now.year, now.month
    for _ in range(6):
        bucket = monthly.get((year, month), {})
        series.append({
            "label": f"{month:02d}/{str(year)[2:]}",
            "revenue_cents": bucket.get("revenue_cents", 0),
            "sales_count": bucket.get("sales_count", 0),
        })
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    series.reverse()

    return {
        "generated_at": now.isoformat(),
        "total_sales_count": len(paid),
        "total_revenue_cents": total_cents,
        "month_sales_count": month_count,
        "month_revenue_cents": month_cents,
        "year_revenue_cents": year_cents,
        # The product is lifetime access, so this is a run-rate projection,
        # not contractual subscription ARR.
        "annualized_revenue_cents": month_cents * 12,
        "customers_count": len(clients),
        "clients": sorted(
            clients.values(),
            key=lambda client: (client["last_paid_at"] or "", client["total_cents"]),
            reverse=True,
        ),
        "monthly_series": series,
    }


@router.get("/api/admin/sales-dashboard")
async def admin_sales_dashboard(
    user: UserContext = Depends(get_current_user),
) -> dict:
    """Private sales dashboard. Orders remain inaccessible to non-admin users."""
    if not is_multi_tenant():
        raise HTTPException(404, "not found")
    await require_admin(user)
    try:
        rows = await asyncio.to_thread(
            rest_get,
            "orders",
            params={
                "select": "correlation_id,customer_name,customer_email,customer_whatsapp,total_cents,status,paid_at,created_at",
                "status": "eq.paid",
                "order": "paid_at.desc",
                "limit": "5000",
            },
        )
    except Exception as exc:
        log.exception("admin sales dashboard failed")
        raise HTTPException(502, "Não foi possível carregar as vendas agora.") from exc
    return _sales_dashboard(rows)


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
