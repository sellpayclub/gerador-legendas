#!/usr/bin/env python3
"""Ativa pedido OpenPix manualmente (quando webhook falhou)."""
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

from openpix_fulfillment import fulfill_openpix_order  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Ativar pedido OpenPix por correlation_id")
    parser.add_argument("correlation_id", help="correlation_id do pedido (UUID)")
    parser.add_argument(
        "--force-resend",
        action="store_true",
        help="Reenvia e-mail mesmo se já estiver ativo",
    )
    args = parser.parse_args()

    result = fulfill_openpix_order(
        args.correlation_id.strip(),
        source="manual",
        force_resend=args.force_resend,
    )
    print(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
