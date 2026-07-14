"""Declarative template definitions for video composition."""
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
    width: int
    height: int
    overlay_region: Region
    video_region: Region
    subtitle_safe_y: int
    needs_overlay: bool
    overlay_accepts: tuple[str, ...]
    layout: str = "vstack"    # "vstack" | "header_hstack"
    header_region: Region | None = None
    left_panel_region: Region | None = None
    right_panel_region: Region | None = None
    subtitle_safe_x: int | None = None  # default center when None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["overlay_accepts"] = list(self.overlay_accepts)
        return d


_CHOQUEI_TOP_H = 576
_CHOQUEI_VIDEO_H = 1344

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
    "choquei_image": TemplateDef(
        id="choquei_image",
        name="Choquei (imagem em cima)",
        description="70% vídeo embaixo, imagem estática em cima — estilo viral.",
        aspect="9:16",
        width=1080, height=1920,
        overlay_region=Region(0, 0, 1080, _CHOQUEI_TOP_H),
        video_region=Region(0, _CHOQUEI_TOP_H, 1080, _CHOQUEI_VIDEO_H),
        subtitle_safe_y=1580,
        needs_overlay=True,
        overlay_accepts=("image",),
    ),
    "choquei_video": TemplateDef(
        id="choquei_video",
        name="Choquei (vídeo em cima)",
        description="70% vídeo embaixo, vídeo loop em cima — estilo viral.",
        aspect="9:16",
        width=1080, height=1920,
        overlay_region=Region(0, 0, 1080, _CHOQUEI_TOP_H),
        video_region=Region(0, _CHOQUEI_TOP_H, 1080, _CHOQUEI_VIDEO_H),
        subtitle_safe_y=1580,
        needs_overlay=True,
        overlay_accepts=("video",),
    ),
}


RESOLUTIONS: dict[str, int] = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
}


def resolution_dims(res_id: str, tpl: TemplateDef) -> tuple[int, int]:
    short = RESOLUTIONS.get(res_id, 1080)
    w, h = tpl.width, tpl.height
    if w <= h:
        scale = short / w
    else:
        scale = short / h
    # H.264 yuv420p requires even dimensions. A 9:16 canvas at 480p would
    # otherwise become 480x853 and fail only at the end of the user workflow.
    out_w = max(2, round(w * scale))
    out_h = max(2, round(h * scale))
    return (out_w + out_w % 2, out_h + out_h % 2)


def get_template(tid: str | None) -> TemplateDef | None:
    if not tid:
        return None
    if tid == "noticia_choquei":
        tid = "reels_full"
    return TEMPLATES.get(tid)


def list_templates() -> list[dict]:
    return [t.to_dict() for t in TEMPLATES.values()]


def list_resolutions() -> list[dict]:
    return [{"id": rid, "label": rid.upper(), "short_edge": short}
            for rid, short in RESOLUTIONS.items()]
