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
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",", 1)[0].strip()
        real_ip = forwarded or (request.headers.get("x-real-ip") or "").strip()
        if real_ip:
            try:
                ipaddress.ip_address(real_ip)
                return real_ip
            except ValueError:
                pass
    return peer
