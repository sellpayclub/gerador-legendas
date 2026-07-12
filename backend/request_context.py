"""Per-request / per-task user context for BYOK OpenAI keys."""
from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Optional

_current_user_id: ContextVar[Optional[str]] = ContextVar("current_user_id", default=None)


def set_current_user_id(user_id: Optional[str]) -> Token:
    return _current_user_id.set(user_id)


def reset_current_user_id(token: Token) -> None:
    _current_user_id.reset(token)


def get_current_user_id() -> Optional[str]:
    return _current_user_id.get()


class user_api_context:
    """Use in background tasks tied to a job owner."""

    def __init__(self, user_id: Optional[str]) -> None:
        self.user_id = user_id
        self._token: Optional[Token] = None

    def __enter__(self) -> "user_api_context":
        self._token = set_current_user_id(self.user_id)
        return self

    def __exit__(self, *args: object) -> None:
        if self._token is not None:
            reset_current_user_id(self._token)
