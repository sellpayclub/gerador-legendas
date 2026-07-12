"""Supabase REST client (service role) for hosted mode."""
from __future__ import annotations

import os
from typing import Any, Optional

import requests


def _base_url() -> str:
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    if not url:
        raise RuntimeError("SUPABASE_URL não configurada.")
    return url


def _service_key() -> str:
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY não configurada.")
    return key


def _headers() -> dict[str, str]:
    return {
        "apikey": _service_key(),
        "Authorization": f"Bearer {_service_key()}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def rest_get(path: str, params: Optional[dict[str, str]] = None) -> list[dict[str, Any]]:
    r = requests.get(
        f"{_base_url()}/rest/v1/{path}",
        headers=_headers(),
        params=params or {},
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase GET {path}: {r.status_code} {r.text[:300]}")
    data = r.json()
    return data if isinstance(data, list) else []


def rest_upsert(path: str, row: dict[str, Any], on_conflict: str) -> list[dict[str, Any]]:
    r = requests.post(
        f"{_base_url()}/rest/v1/{path}",
        headers={**_headers(), "Prefer": f"resolution=merge-duplicates,return=representation"},
        params={"on_conflict": on_conflict},
        json=row,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase UPSERT {path}: {r.status_code} {r.text[:300]}")
    data = r.json()
    return data if isinstance(data, list) else []


def rest_patch(path: str, params: dict[str, str], body: dict[str, Any]) -> None:
    r = requests.patch(
        f"{_base_url()}/rest/v1/{path}",
        headers=_headers(),
        params=params,
        json=body,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase PATCH {path}: {r.status_code} {r.text[:300]}")


def rest_delete(path: str, params: dict[str, str]) -> None:
    r = requests.delete(
        f"{_base_url()}/rest/v1/{path}",
        headers=_headers(),
        params=params,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase DELETE {path}: {r.status_code} {r.text[:300]}")


def auth_admin_create_user(email: str, password: Optional[str] = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"email": email, "email_confirm": True}
    if password:
        payload["password"] = password
    r = requests.post(
        f"{_base_url()}/auth/v1/admin/users",
        headers=_headers(),
        json=payload,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase create user: {r.status_code} {r.text[:300]}")
    return r.json()


def auth_admin_update_user(user_id: str, *, password: Optional[str] = None) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if password:
        payload["password"] = password
    r = requests.put(
        f"{_base_url()}/auth/v1/admin/users/{user_id}",
        headers=_headers(),
        json=payload,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase update user: {r.status_code} {r.text[:300]}")
    return r.json()


def auth_admin_generate_link(
    email: str,
    link_type: str = "magiclink",
    *,
    redirect_to: Optional[str] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": link_type, "email": email}
    if redirect_to:
        payload["options"] = {"redirect_to": redirect_to}
    r = requests.post(
        f"{_base_url()}/auth/v1/admin/generate_link",
        headers=_headers(),
        json=payload,
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase generate_link: {r.status_code} {r.text[:300]}")
    return r.json()
