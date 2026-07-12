"""Job metadata sync with Supabase (hosted mode)."""
from __future__ import annotations

from typing import Optional

from supabase_client import rest_delete, rest_get, rest_upsert


def register_job(job_id: str, user_id: str, filename: str, mode: str) -> None:
    rest_upsert(
        "jobs",
        {
            "id": job_id,
            "user_id": user_id,
            "filename": filename,
            "mode": mode,
        },
        on_conflict="id",
    )


def unregister_job(job_id: str) -> None:
    try:
        rest_delete("jobs", params={"id": f"eq.{job_id}"})
    except Exception:
        pass


def job_owned_by(job_id: str, user_id: str) -> bool:
    rows = rest_get("jobs", params={"id": f"eq.{job_id}", "select": "user_id"})
    if not rows:
        return False
    return str(rows[0].get("user_id")) == user_id


def list_job_ids_for_user(user_id: str) -> set[str]:
    rows = rest_get("jobs", params={"user_id": f"eq.{user_id}", "select": "id"})
    return {str(r["id"]) for r in rows if r.get("id")}
