"""FastAPI dependencies for hosted multi-tenant mode."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, Query

import jobs
from auth import UserContext, decode_bearer_token, get_current_user, require_active_user, require_user
from db_jobs import job_owned_by
from jobs import Job
from tenant import is_multi_tenant
from user_secrets import user_has_openai_key


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
        return await require_active_user(user)
    return None


async def mt_openai_user(
    user: Optional[UserContext] = Depends(get_current_user),
) -> Optional[UserContext]:
    if is_multi_tenant():
        u = await require_active_user(user)
        if not user_has_openai_key(u.user_id):
            raise HTTPException(
                403,
                "Configure sua chave OpenAI em Configurações antes de usar.",
            )
        return u
    return None


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
        return await require_active_user(user)
    return None


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
