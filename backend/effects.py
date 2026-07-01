"""Highlight blur windows for dramatic moments."""
from __future__ import annotations

BLUR_PRE_S = 0.12
BLUR_POST_S = 0.25


def _window(ph: dict) -> tuple[float, float]:
    s = max(0.0, float(ph["start"]) - BLUR_PRE_S)
    e = float(ph["end"]) + BLUR_POST_S
    return s, e


def blur_enable_expr(phrases: list[dict]) -> str:
    parts: list[str] = []
    for ph in phrases:
        s, e = _window(ph)
        parts.append(f"between(t,{s:.3f},{e:.3f})")
    return "+".join(parts) if parts else ""
