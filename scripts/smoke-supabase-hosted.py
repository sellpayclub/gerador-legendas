#!/usr/bin/env python3
"""Smoke test Supabase hosted schema via REST (service role)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("SUPABASE_URL", "https://lcbczyzedluaoxtuajoz.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()


def rest_get(path: str, params: dict[str, str]) -> tuple[int, object]:
    if not KEY:
        raise RuntimeError("Set SUPABASE_SERVICE_ROLE_KEY")
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}?{qs}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, body


def check(label: str, path: str, params: dict[str, str]) -> bool:
    status, data = rest_get(path, params)
    if status >= 400:
        print(f"FAIL {label}: HTTP {status} — {data}")
        return False
    sample = data[0] if isinstance(data, list) and data else data
    print(f"OK   {label}: {sample}")
    return True


def main() -> int:
    if not KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    ok = True
    ok &= check("profiles", "profiles", {"select": "id,email,access_active", "limit": "1"})
    ok &= check("jobs", "jobs", {"select": "id", "limit": "1"})
    ok &= check("user_secrets", "user_secrets", {"select": "user_id", "limit": "1"})

    status, data = rest_get(
        "profiles",
        {"email": "eq.personaldann@gmail.com", "select": "email,access_active,plan_name"},
    )
    if status >= 400:
        print(f"FAIL admin lookup: HTTP {status} — {data}")
        ok = False
    elif not data:
        print("WARN admin: personaldann@gmail.com not found in profiles")
        ok = False
    else:
        row = data[0]
        print(f"OK   admin: {row}")
        if not row.get("access_active"):
            print("WARN admin: access_active is false")
            ok = False

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
