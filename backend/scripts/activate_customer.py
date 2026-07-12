#!/usr/bin/env python3
"""Ativa acesso manualmente e reenvia e-mail de compra (admin)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_env = ROOT / ".env"
if _env.is_file():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

from cakto_webhook import _activate_purchase  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Ativar cliente e enviar e-mail de acesso")
    parser.add_argument("email", help="E-mail do cliente")
    parser.add_argument("--name", default="", help="Nome do cliente")
    parser.add_argument("--product", default="ClipSaaS — Gerador de Legendas")
    parser.add_argument("--order-id", default="manual-activation")
    args = parser.parse_args()

    data = {
        "customer": {"email": args.email.strip().lower(), "name": args.name},
        "product": {"name": args.product},
        "id": args.order_id,
    }
    result = _activate_purchase(data)
    print(result)
    return 0 if result.get("ok") and result.get("email_sent") else 1


if __name__ == "__main__":
    raise SystemExit(main())
