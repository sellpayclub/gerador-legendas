"""Server-side rules for the anonymous ViralClips mobile experience."""
from __future__ import annotations

import os
from datetime import datetime, timezone

import requests

from fastapi import APIRouter, Depends, HTTPException

from auth import UserContext, get_current_user, require_user
from supabase_client import rest_patch, rest_upsert

router = APIRouter()


def mobile_openai_ready() -> bool:
    return bool(os.environ.get("MOBILE_OPENAI_API_KEY", "").strip())


def _revenuecat_entitlement_active(app_user_id: str) -> bool:
    """Read entitlement state from RevenueCat using its server-only v1 key."""
    secret = os.environ.get("REVENUECAT_SECRET_API_KEY", "").strip()
    if not secret:
        raise HTTPException(503, "A validação de assinatura está temporariamente indisponível.")
    response = requests.get(
        f"https://api.revenuecat.com/v1/subscribers/{app_user_id}",
        headers={"Authorization": f"Bearer {secret}", "Accept": "application/json"},
        timeout=15,
    )
    if response.status_code >= 400:
        raise HTTPException(502, "Não foi possível validar a assinatura agora.")
    entitlement = (response.json().get("subscriber", {}).get("entitlements", {})
                   .get(os.environ.get("REVENUECAT_ENTITLEMENT", "ClipSaaS Pro")))
    if not isinstance(entitlement, dict):
        return False
    expires_at = entitlement.get("expires_date")
    if not expires_at:  # Non-expiring entitlement, e.g. a future lifetime plan.
        return True
    try:
        return datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except ValueError:
        return False


@router.post("/api/mobile/session")
async def start_mobile_session(
    user: UserContext | None = Depends(get_current_user),
) -> dict:
    """Enroll a Supabase anonymous identity for the mobile processing flow.

    The app creates this identity locally without asking for email or password.
    Purchase status is never accepted from this endpoint; that is updated only by
    the RevenueCat webhook/server verification path.
    """
    u = await require_user(user)
    if not u.is_anonymous:
        raise HTTPException(403, "A sessão móvel precisa ser uma conta anônima.")
    if not mobile_openai_ready():
        raise HTTPException(503, "O processamento móvel está temporariamente indisponível.")
    rest_upsert(
        "profiles",
        # plan_name already exists in production. It keeps the mobile flow
        # deployable independently of the optional schema migration.
        {"id": u.user_id, "plan_name": "viralclips_pro" if u.mobile_premium else "viralclips_free"},
        on_conflict="id",
    )
    return {"ok": True, "premium": bool(u.mobile_premium)}


@router.post("/api/mobile/entitlement/sync")
async def sync_mobile_entitlement(
    user: UserContext | None = Depends(get_current_user),
) -> dict:
    """Refresh a purchase after the native paywall closes.

    The device cannot grant access: it only asks the backend to query RevenueCat
    with the private key and persist the resulting entitlement.
    """
    u = await require_user(user)
    if not u.is_anonymous or not u.mobile_access:
        raise HTTPException(403, "Sessão móvel inválida.")
    premium = _revenuecat_entitlement_active(u.user_id)
    rest_patch(
        "profiles",
        params={"id": f"eq.{u.user_id}"},
        body={
            "plan_name": "viralclips_pro" if premium else "viralclips_free",
        },
    )
    return {"ok": True, "premium": premium}
