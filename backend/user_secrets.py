"""Per-user OpenAI API keys (encrypted in Supabase)."""
from __future__ import annotations

from typing import Optional

from crypto_util import decrypt_text, encrypt_text
from supabase_client import rest_delete, rest_get, rest_upsert


def get_user_openai_key_status(user_id: str) -> dict[str, object]:
    """Return a safe status without turning an unreadable key into a 500."""
    rows = rest_get(
        "user_secrets",
        params={"user_id": f"eq.{user_id}", "select": "openai_api_key_encrypted"},
    )
    if not rows or not rows[0].get("openai_api_key_encrypted"):
        return {"status": "missing", "configured": False, "key": None}
    cipher = str(rows[0]["openai_api_key_encrypted"])
    try:
        key = decrypt_text(cipher).strip()
    except Exception:
        return {"status": "unreadable", "configured": False, "key": None}
    if not key:
        return {"status": "missing", "configured": False, "key": None}
    return {"status": "ready", "configured": True, "key": key}


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
    state = get_user_openai_key_status(user_id)
    if state["status"] == "unreadable":
        raise RuntimeError(
            "A chave OpenAI salva não pôde ser lida. Salve a chave novamente em Configurações."
        )
    key = state.get("key")
    return str(key) if key else None


def user_has_openai_key(user_id: str) -> bool:
    return bool(get_user_openai_key_status(user_id)["configured"])
