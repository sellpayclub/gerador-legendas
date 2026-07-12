"""Per-user OpenAI API keys (encrypted in Supabase)."""
from __future__ import annotations

from typing import Optional

from crypto_util import decrypt_text, encrypt_text
from supabase_client import rest_delete, rest_get, rest_upsert


def save_user_openai_key(user_id: str, api_key: str) -> None:
    key = (api_key or "").strip()
    if not key or key.startswith("••"):
        raise ValueError("API key inválida.")
    rest_upsert(
        "user_secrets",
        {
            "user_id": user_id,
            "openai_api_key_encrypted": encrypt_text(key),
        },
        on_conflict="user_id",
    )


def delete_user_openai_key(user_id: str) -> None:
    rest_delete("user_secrets", params={"user_id": f"eq.{user_id}"})


def get_user_openai_key(user_id: str) -> Optional[str]:
    rows = rest_get(
        "user_secrets",
        params={"user_id": f"eq.{user_id}", "select": "openai_api_key_encrypted"},
    )
    if not rows:
        return None
    cipher = rows[0].get("openai_api_key_encrypted") or ""
    if not cipher:
        return None
    return decrypt_text(cipher)


def user_has_openai_key(user_id: str) -> bool:
    return bool(get_user_openai_key(user_id))
