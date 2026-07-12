"""Symmetric encryption for user secrets at rest."""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger("legendas.crypto")


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    raw = (os.environ.get("ENCRYPTION_KEY") or "").strip()
    if not raw:
        raise RuntimeError("ENCRYPTION_KEY não configurada (hosted mode).")
    try:
        return Fernet(raw.encode() if isinstance(raw, str) else raw)
    except Exception:
        log.warning(
            "ENCRYPTION_KEY não é um Fernet key válido — derivando via SHA-256. "
            "Considere gerar uma chave com: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
        digest = hashlib.sha256(raw.encode()).digest()
        key = base64.urlsafe_b64encode(digest)
        return Fernet(key)


def encrypt_text(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_text(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Falha ao descriptografar segredo.") from exc
