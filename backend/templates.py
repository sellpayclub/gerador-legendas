"""Declarative template definitions for video composition.

A TemplateDef describes the output canvas (aspect + dimensions) and the
rectangular regions inside it where (a) the user-uploaded overlay media lives
and (b) the original input video is rendered (scaled + cropped to fit).

The render pipeline (compose.py) reads a template to build the FFmpeg
filtergraph; ass_gen.py uses template width/height as the ASS PlayRes so the
subtitle positions match the composed canvas, not the raw input.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Region:
    """A rectangle inside the template canvas (pixels, top-left origin)."""
    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True)
class TemplateDef:
    id: str
    name: str
    description: str
    aspect: str               # "9:16" | "1:1" | "16:9"
    width: int                # canvas width (e.g. 1080)
    height: int               # canvas height (e.g. 1920)
    overlay_region: Region    # where the user-uploaded asset is drawn
    video_region: Region      # where the original video is drawn (scaled+cropped)
    subtitle_safe_y: int      # default pos_y for subtitles so they don't overlap edges
    needs_overlay: bool       # if True, render fails when no asset uploaded
    overlay_accepts: tuple[str, ...]  # ("image",) | ("image","video")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["overlay_accepts"] = list(self.overlay_accepts)
        return d


TEMPLATES: dict[str, TemplateDef] = {
    "reels_split": TemplateDef(
        id="reels_split",
        name="Reels 9:16 (split topo/baixo)",
        description="Vídeo original embaixo, espaço em cima pra imagem ou vídeo.",
        aspect="9:16",
        width=1080, height=1920,
        overlay_region=Region(0, 0, 1080, 960),
        video_region=Region(0, 960, 1080, 960),
        subtitle_safe_y=1820,
        needs_overlay=True,
        overlay_accepts=("image", "video"),
    ),
    "ig_square": TemplateDef(
        id="ig_square",
        name="Instagram 1:1 (quadrado)",
        description="Vídeo original embaixo, imagem em cima. Perfeito pro feed.",
        aspect="1:1",
        width=1080, height=1080,
        overlay_region=Region(0, 0, 1080, 540),
        video_region=Region(0, 540, 1080, 540),
        subtitle_safe_y=1020,
        needs_overlay=True,
        overlay_accepts=("image", "video"),
    ),
    "reels_full": TemplateDef(
        id="reels_full",
        name="Reels 9:16 (tela cheia)",
        description="Vídeo vertical 9:16 com crop central — sem overlay.",
        aspect="9:16",
        width=1080, height=1920,
        overlay_region=Region(0, 0, 0, 0),
        video_region=Region(0, 0, 1080, 1920),
        subtitle_safe_y=1820,
        needs_overlay=False,
        overlay_accepts=(),
    ),
}


# Resolution presets. We store the SHORT edge size; compose.py computes the
# final (w, h) from the template aspect ratio so 480p on a 9:16 template means
# 480x854 (vertical), and on 1:1 means 480x480.
RESOLUTIONS: dict[str, int] = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
}


def resolution_dims(res_id: str, tpl: TemplateDef) -> tuple[int, int]:
    """Return (width, height) for the given resolution id and template aspect."""
    short = RESOLUTIONS.get(res_id, 1080)
    w, h = tpl.width, tpl.height
    if w <= h:
        # vertical or square: short edge = width
        scale = short / w
    else:
        scale = short / h
    return (max(2, round(w * scale)), max(2, round(h * scale)))


def get_template(tid: str | None) -> TemplateDef | None:
    if not tid:
        return None
    return TEMPLATES.get(tid)


def list_templates() -> list[dict]:
    return [t.to_dict() for t in TEMPLATES.values()]


def list_resolutions() -> list[dict]:
    return [{"id": rid, "label": rid.upper(), "short_edge": short}
            for rid, short in RESOLUTIONS.items()]
