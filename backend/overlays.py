"""Compose overlay helpers: extras model, fake progress, Instagram header PNG."""
from __future__ import annotations

import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = None  # type: ignore[misc, assignment]
    ImageDraw = None  # type: ignore[misc, assignment]
    ImageFont = None  # type: ignore[misc, assignment]

FONTS_DIR = Path(__file__).resolve().parent / "fonts"


@dataclass
class InstagramHeader:
    profile_asset: str | None = None
    username: str = ""
    caption: str = ""
    bg_color: str = "#FFFFFF"
    text_color: str = "#141414"
    avatar_size: int = 72
    username_size: int = 34
    caption_size: int = 28

    @classmethod
    def from_dict(cls, d: dict | None) -> InstagramHeader | None:
        if not d:
            return None
        return cls(
            profile_asset=d.get("profile_asset"),
            username=str(d.get("username") or ""),
            caption=str(d.get("caption") or ""),
            bg_color=str(d.get("bg_color") or d.get("ig_bg_color") or "#FFFFFF"),
            text_color=str(d.get("text_color") or d.get("ig_text_color") or "#141414"),
            avatar_size=int(d.get("avatar_size") or d.get("ig_avatar_size") or 72),
            username_size=int(d.get("username_size") or d.get("ig_username_size") or 34),
            caption_size=int(d.get("caption_size") or d.get("ig_caption_size") or 28),
        )


@dataclass
class ComposeExtras:
    headline_text: str | None = None
    headline_style: str = "bold_red"
    headline_bg: str = "#E31B23"
    headline_color: str = "#FFFFFF"
    headline_font_size: int = 42
    headline_align: str = "center"
    headline_max_width_pct: float = 0.85
    overlay_pos_x: float = 0.5
    overlay_pos_y: float = 0.5
    instagram: InstagramHeader | None = None
    logo_path: Path | None = None
    logo_x: float = 0.85
    logo_y: float = 0.78
    logo_scale: float = 0.18
    progress_enabled: bool = False
    progress_color: str = "#E31B23"
    progress_height_pct: float = 0.04
    progress_fast_until: float = 0.35
    progress_fill_at_fast: float = 0.70

    @classmethod
    def from_dict(cls, d: dict | None, job_dir: Path | None = None) -> ComposeExtras:
        if not d:
            return cls()
        logo_path: Path | None = None
        if d.get("logo_asset") and job_dir:
            logo_path = job_dir / "assets" / Path(str(d["logo_asset"])).name
            if not logo_path.exists():
                logo_path = None
        ig_raw = d.get("instagram")
        if isinstance(ig_raw, dict):
            ig = InstagramHeader.from_dict(ig_raw)
        else:
            ig = InstagramHeader(
                profile_asset=d.get("profile_asset"),
                username=str(d.get("instagram_username") or ""),
                caption=str(d.get("instagram_caption") or ""),
                bg_color=str(d.get("ig_bg_color") or "#FFFFFF"),
                text_color=str(d.get("ig_text_color") or "#141414"),
                avatar_size=int(d.get("ig_avatar_size") or 72),
                username_size=int(d.get("ig_username_size") or 34),
                caption_size=int(d.get("ig_caption_size") or 28),
            )
        return cls(
            headline_text=d.get("headline_text") or d.get("headline"),
            headline_style=str(d.get("headline_style") or "bold_red"),
            headline_bg=str(d.get("headline_bg") or "#E31B23"),
            headline_color=str(d.get("headline_color") or "#FFFFFF"),
            headline_font_size=int(d.get("headline_font_size") or 42),
            headline_align=str(d.get("headline_align") or "center"),
            headline_max_width_pct=float(d.get("headline_max_width_pct", 0.85)),
            overlay_pos_x=float(d.get("overlay_pos_x", 0.5)),
            overlay_pos_y=float(d.get("overlay_pos_y", 0.5)),
            instagram=ig,
            logo_path=logo_path,
            logo_x=float(d.get("logo_x", 0.85)),
            logo_y=float(d.get("logo_y", 0.78)),
            logo_scale=float(d.get("logo_scale", 0.18)),
            progress_enabled=bool(d.get("progress_enabled", False)),
            progress_color=str(d.get("progress_color") or "#E31B23"),
            progress_height_pct=float(d.get("progress_height_pct", 0.04)),
            progress_fast_until=float(d.get("progress_fast_until", 0.35)),
            progress_fill_at_fast=float(d.get("progress_fill_at_fast", 0.70)),
        )


def wrap_headline_text(
    text: str,
    canvas_width: int,
    font_size: int,
    width_pct: float = 0.85,
) -> str:
    """Pre-wrap headline for FFmpeg drawtext (approximate chars per line from width %)."""
    pct = max(0.5, min(1.0, width_pct))
    max_px = canvas_width * pct
    char_w = max(6.0, font_size * 0.55)
    max_chars = max(6, int(max_px / char_w))
    lines = textwrap.wrap(text, width=max_chars, break_long_words=True, break_on_hyphens=False)
    return "\n".join(lines) if lines else text


def fake_progress(t: float, duration: float, *, fast_until: float = 0.35, fill_at: float = 0.70) -> float:
    """Return bar fill 0..1 for real time t (shared with frontend preview)."""
    if duration <= 0:
        return 0.0
    if t >= duration:
        return 1.0
    ratio = max(0.0, t / duration)
    if ratio <= fast_until:
        val = min(fill_at, ratio / fast_until * fill_at) if fast_until > 0 else fill_at
    else:
        rem = 1.0 - fast_until
        if rem <= 0:
            return 1.0
        val = fill_at + (1.0 - fill_at) * ((ratio - fast_until) / rem)
    return min(1.0, val)


def fake_progress_expr(
    duration: float,
    *,
    fast_until: float = 0.35,
    fill_at: float = 0.70,
) -> str:
    """FFmpeg expression for progress fraction 0..1 given time t."""
    d = max(0.001, duration)
    fu = max(0.01, min(0.99, fast_until))
    fa = max(0.01, min(0.99, fill_at))
    rem = 1.0 - fu
    inner = (
        f"if(lt(t,{fu * d:.3f}),"
        f"min({fa:.4f},t/({fu * d:.3f})*{fa:.4f}),"
        f"{fa:.4f}+(1-{fa:.4f})*((t-{fu * d:.3f})/({rem * d:.3f})))"
    )
    return f"min(1,{inner})"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _load_font(size: int, bold: bool = False) -> Any:
    if ImageFont is None:
        raise RuntimeError("Pillow não instalado — pip install pillow")
    names = ["Roboto-Bold.ttf", "Inter-Bold.ttf"] if bold else ["Roboto-Regular.ttf", "OpenSans-Regular.ttf"]
    for name in names:
        p = FONTS_DIR / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def render_instagram_header_png(
    out_path: Path,
    *,
    width: int,
    height: int,
    username: str,
    caption: str,
    profile_path: Path | None = None,
    bg_color: str = "#FFFFFF",
    text_color: str = "#141414",
    avatar_size: int = 72,
    username_size: int = 34,
    caption_size: int = 28,
) -> Path:
    """Render white Instagram-style header as PNG."""
    if Image is None:
        raise RuntimeError("Pillow não instalado — pip install pillow")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg = _hex_to_rgb(bg_color)
    fg = _hex_to_rgb(text_color)
    img = Image.new("RGBA", (width, height), (*bg, 255))
    draw = ImageDraw.Draw(img)

    avatar_d = max(40, min(96, avatar_size))
    ax, ay = 36, 36
    if profile_path and profile_path.exists():
        try:
            av = Image.open(profile_path).convert("RGBA")
            av = av.resize((avatar_d, avatar_d), Image.Resampling.LANCZOS)
            mask = Image.new("L", (avatar_d, avatar_d), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, avatar_d, avatar_d), fill=255)
            img.paste(av, (ax, ay), mask)
        except Exception:
            draw.ellipse((ax, ay, ax + avatar_d, ay + avatar_d), fill=(220, 220, 220))
    else:
        draw.ellipse((ax, ay, ax + avatar_d, ay + avatar_d), fill=(220, 220, 220))

    user_font = _load_font(max(18, username_size), bold=True)
    cap_font = _load_font(max(14, caption_size), bold=False)
    uname = username.strip() or "usuario"
    draw.text((ax + avatar_d + 20, ay + 8), uname, fill=fg, font=user_font)

    for i, dy in enumerate((0, 14, 28)):
        draw.ellipse((width - 48, ay + 18 + dy, width - 40, ay + 26 + dy), fill=(80, 80, 80))

    cap_y = ay + avatar_d + 24
    cap_text = caption.strip() or "Sua legenda aqui..."
    wrapped = textwrap.fill(cap_text, width=42)
    draw.multiline_text((36, cap_y), wrapped, fill=fg, font=cap_font, spacing=6)

    img.convert("RGB").save(out_path, "PNG")
    return out_path


def escape_drawtext(text: str) -> str:
    """Escape text for FFmpeg drawtext filter."""
    out = []
    for ch in text:
        if ch in "\\':%":
            out.append("\\" + ch)
        elif ch == "\n":
            out.append("\n")
        else:
            out.append(ch)
    return "".join(out)
