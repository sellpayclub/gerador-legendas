"""JWT auth and user profile access (hosted multi-tenant)."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

import jwt
import requests
from fastapi import Header, HTTPException

from tenant import is_multi_tenant

log = logging.getLogger("legendas.auth")


@dataclass
class UserContext:
    user_id: str
    email: str
    access_active: bool


def _auth_api_key() -> str:
    key = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "SUPABASE_ANON_KEY não configurada. "
            "Defina no .env para validar tokens de autenticação."
        )
    return key


def _verify_token_via_auth_api(token: str) -> dict[str, Any]:
    from supabase_client import _base_url

    r = requests.get(
        f"{_base_url()}/auth/v1/user",
        headers={
            "apikey": _auth_api_key(),
            "Authorization": f"Bearer {token}",
        },
        timeout=15,
    )
    if r.status_code >= 400:
        raise HTTPException(401, "Token inválido ou expirado.")
    user = r.json()
    uid = user.get("id")
    if not uid:
        raise HTTPException(401, "Token inválido.")
    return {"sub": str(uid), "email": user.get("email")}


def decode_bearer_token(token: str) -> dict[str, Any]:
    secret = (os.environ.get("SUPABASE_JWT_SECRET") or "").strip()
    if secret:
        try:
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(401, "Token inválido ou expirado.") from exc
    return _verify_token_via_auth_api(token)


def _load_profile(user_id: str) -> dict[str, Any]:
    from supabase_client import rest_get

    rows = rest_get("profiles", params={"id": f"eq.{user_id}", "select": "*"})
    if rows:
        return rows[0]
    return {"id": user_id, "email": "", "access_active": False}


async def get_current_user(
    authorization: Optional[str] = Header(None),
) -> Optional[UserContext]:
    if not is_multi_tenant():
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Autenticação necessária.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, "Autenticação necessária.")
    payload = decode_bearer_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(401, "Token inválido.")
    profile = _load_profile(str(sub))
    return UserContext(
        user_id=str(sub),
        email=str(profile.get("email") or payload.get("email") or ""),
        access_active=bool(profile.get("access_active")),
    )


async def require_user(user: Optional[UserContext] = None) -> UserContext:
    if user is None:
        raise HTTPException(401, "Autenticação necessária.")
    return user


async def require_active_user(user: Optional[UserContext] = None) -> UserContext:
    u = await require_user(user)
    if is_multi_tenant() and not u.access_active:
        raise HTTPException(
            402,
            "Plano inativo. Conclua a compra ou aguarde liberação do acesso.",
        )
    return u


async def require_admin(user: Optional[UserContext] = None) -> UserContext:
    u = await require_user(user)
    profile = _load_profile(u.user_id)
    if not profile.get("is_admin"):
        raise HTTPException(403, "Acesso restrito a administradores.")
    return u
