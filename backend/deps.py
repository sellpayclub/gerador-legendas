"""FastAPI dependencies for hosted multi-tenant mode."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, Query

import jobs
from auth import UserContext, decode_bearer_token, get_current_user, is_anonymous_payload, is_mobile_profile, is_mobile_premium_profile, require_active_user, require_user
from db_jobs import job_owned_by
from jobs import Job
from tenant import is_multi_tenant
from user_secrets import get_user_openai_key_status


async def optional_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> Optional[UserContext]:
    return user


async def active_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> UserContext:
    return await require_active_user(user)


async def mt_active_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> Optional[UserContext]:
    if is_multi_tenant():
        return await mt_work_user(user)
    return None


async def mt_openai_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> Optional[UserContext]:
    if is_multi_tenant():
        u = await mt_work_user(user)
        if u is not None and u.mobile_access:
            from mobile_access import mobile_openai_ready

            if not mobile_openai_ready():
                raise HTTPException(503, "O processamento móvel está temporariamente indisponível.")
            return u
        key_state = get_user_openai_key_status(u.user_id)
        if key_state["status"] == "unreadable":
            raise HTTPException(
                409,
                detail={
                    "code": "openai_key_unreadable",
                    "message": "Sua chave salva precisa ser cadastrada novamente em Configurações.",
                },
            )
        if not key_state["configured"]:
            raise HTTPException(
                403,
                detail={
                    "code": "openai_key_missing",
                    "message": "Configure sua chave OpenAI em Configurações antes de usar.",
                },
            )
        return u
    return None


async def mt_work_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> Optional[UserContext]:
    """Allow active web customers and enrolled anonymous mobile customers to edit."""
    if not is_multi_tenant():
        return None
    u = await require_user(user)
    if u.access_active or u.mobile_access:
        return u
    raise HTTPException(402, "Plano inativo. Conclua a compra ou aguarde liberação do acesso.")


async def mt_export_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> Optional[UserContext]:
    """Only a paid web account or RevenueCat-entitled mobile account may render."""
    if not is_multi_tenant():
        return None
    u = await require_user(user)
    if u.access_active or (u.mobile_access and u.mobile_premium):
        return u
    if u.mobile_access:
        raise HTTPException(
            402,
            detail={
                "code": "mobile_export_required",
                "message": "Assine o ViralClips Pro para renderizar e salvar o vídeo.",
            },
        )
    raise HTTPException(402, "Plano inativo. Conclua a compra ou aguarde liberação do acesso.")


async def _user_from_token(authorization: Optional[str], access_token: Optional[str]) -> Optional[UserContext]:
    if not is_multi_tenant():
        return None
    token: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif access_token:
        token = access_token.strip()
    if not token:
        raise HTTPException(401, "Autenticação necessária.")
    payload = decode_bearer_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(401, "Token inválido.")
    from auth import _load_profile

    profile = _load_profile(str(sub))
    return UserContext(
        user_id=str(sub),
        email=str(profile.get("email") or payload.get("email") or ""),
        access_active=bool(profile.get("access_active")),
        is_anonymous=is_anonymous_payload(payload),
        mobile_access=is_mobile_profile(profile),
        mobile_premium=is_mobile_premium_profile(profile),
    )


async def mt_active_user_media(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Query(None),
) -> Optional[UserContext]:
    # NOTE: access_token via query param is only used for video/audio streaming
    # endpoints (SSE/video serve). It is intentionally NOT accepted for
    # state-changing endpoints to prevent CSRF via URL injection.
    user = await _user_from_token(authorization, access_token)
    if is_multi_tenant():
        return await mt_work_user(user)
    return None


async def mt_export_user_media(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Query(None),
) -> Optional[UserContext]:
    user = await _user_from_token(authorization, access_token)
    if not is_multi_tenant():
        return None
    return await mt_export_user(user)


def resolve_job(job_id: str, user: Optional[UserContext]) -> Job:
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if is_multi_tenant():
        if not user:
            raise HTTPException(401, "Autenticação necessária.")
        if job.user_id and job.user_id != user.user_id:
            raise HTTPException(404, "job not found")
        if not job.user_id and not job_owned_by(job_id, user.user_id):
            raise HTTPException(404, "job not found")
    return job
