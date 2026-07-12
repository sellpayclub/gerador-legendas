#!/usr/bin/env python3
"""Reenvia evento Purchase para Meta Conversions API (pedido OpenPix)."""
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

from meta_capi import send_purchase_from_order  # noqa: E402
from openpix_fulfillment import _get_order  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Send Meta CAPI Purchase for an order")
    parser.add_argument("correlation_id", help="OpenPix correlation_id (order id)")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Send even if meta_purchase_sent_at is already set",
    )
    args = parser.parse_args()

    order = _get_order(args.correlation_id)
    if not order:
        print(f"Order not found: {args.correlation_id}", file=sys.stderr)
        return 1

    result = send_purchase_from_order(order, force=args.force)
    print(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
