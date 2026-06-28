"""Subtitle style presets and StyleConfig dataclass.

Colours are stored as hex strings (#RRGGBB or #AARRGGBB). They are converted
to ASS BGR (&HBBGGRR&) at generation time.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class StyleConfig:
    font: str = "Montserrat"
    font_size: int = 72
    primary_color: str = "#FACC15"   # highlighted (karaoke fill target)
    secondary_color: str = "#FFFFFF" # base text
    outline_color: str = "#000000"
    outline_width: int = 8
    shadow: int = 0
    bold: bool = True
    italic: bool = False
    animation: str = "pop"           # "pop" | "fade" | "none"
    pop_scale: int = 115             # % scale at peak of pop-in
    pop_duration_ms: int = 120
    box: bool = False                # draw opaque rounded box behind text
    box_color: str = "#000000"
    box_opacity: float = 0.5
    # Position in PlayResX/Y units. None = auto (bottom-center via \an2 + margin).
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    margin_v: int = 120              # used when pos is None
    letter_spacing: int = 2          # ASS Spacing field (px between chars)
    word_spacing: int = 4            # extra px gap between words at PlayRes
    # Per-word pop scale (%) applied to keyword words when spoken (CapCut style).
    keyword_scale: int = 180

    def to_dict(self) -> dict:
        return asdict(self)


PRESETS: dict[str, dict] = {
    "capcut_amarelo": {
        "font": "Montserrat", "font_size": 72,
        "primary_color": "#FACC15", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 8,
        "bold": True, "animation": "pop", "pop_scale": 115,
    },
    "capcut_ciano": {
        "font": "Montserrat", "font_size": 72,
        "primary_color": "#22D3EE", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 8,
        "bold": True, "animation": "pop", "pop_scale": 115,
    },
    "minimalista": {
        "font": "Inter", "font_size": 64,
        "primary_color": "#EC4899", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 2,
        "bold": False, "animation": "none",
    },
    "youtube_caixa": {
        "font": "Arial", "font_size": 56,
        "primary_color": "#FFFFFF", "secondary_color": "#CCCCCC",
        "outline_color": "#000000", "outline_width": 2,
        "bold": True, "animation": "none",
        "box": True, "box_color": "#000000", "box_opacity": 0.55,
    },
}


def apply_preset(preset: Optional[str], custom: Optional[dict]) -> StyleConfig:
    cfg = StyleConfig()
    if preset and preset in PRESETS:
        for k, v in PRESETS[preset].items():
            setattr(cfg, k, v)
    if custom:
        for k, v in custom.items():
            if hasattr(cfg, k) and v is not None:
                setattr(cfg, k, v)
    return cfg


def list_presets() -> dict:
    return {"presets": [{"id": k, "name": k.replace("_", " ").title(),
                         "values": v} for k, v in PRESETS.items()]}
