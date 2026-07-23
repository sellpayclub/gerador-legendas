"""Resolve a client address without trusting spoofed forwarding headers."""
from __future__ import annotations

import ipaddress

from fastapi import Request


def get_client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    try:
        trusted_proxy = ipaddress.ip_address(peer).is_private or ipaddress.ip_address(peer).is_loopback
    except ValueError:
        trusted_proxy = False
    if trusted_proxy:
        # Proxies append the peer address to X-Forwarded-For. Do not trust the
        # left-most value: a caller can send it themselves and bypass a
        # per-IP limiter. Select the right-most public address instead.
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",")
        for value in reversed(forwarded):
            real_ip = value.strip()
            if not real_ip:
                continue
            try:
                parsed = ipaddress.ip_address(real_ip)
                if not (parsed.is_private or parsed.is_loopback or parsed.is_link_local):
                    return real_ip
            except ValueError:
                continue
        real_ip = (request.headers.get("x-real-ip") or "").strip()
        if real_ip:
            try:
                parsed = ipaddress.ip_address(real_ip)
                if not (parsed.is_private or parsed.is_loopback or parsed.is_link_local):
                    return real_ip
            except ValueError:
                pass
    return peer
