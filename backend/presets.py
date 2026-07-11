"""Subtitle style presets and StyleConfig dataclass.

Colours are stored as hex strings (#RRGGBB or #AARRGGBB). They are converted
to ASS BGR (&HBBGGRR&) at generation time.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal, Optional

TextCase = Literal["normal", "upper", "lower"]

# Bundled in backend/fonts/ — must match StylePicker + subtitleLayout.
AVAILABLE_FONTS = (
    "Roboto",
    "Open Sans",
    "Lato",
    "Raleway",
    "Inter",
    "Montserrat",
)


@dataclass
class StyleConfig:
    font: str = "Roboto"
    font_size: int = 72
    text_case: TextCase = "normal"
    pause_threshold_s: float = 0.45
    primary_color: str = "#FACC15"   # highlighted (karaoke fill target)
    secondary_color: str = "#FFFFFF" # base text
    outline_color: str = "#000000"
    outline_width: int = 8
    shadow: int = 0
    bold: bool = True
    italic: bool = False
    animation: str = "pop"           # pop | fade | bounce | slide | none
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


PRESET_LABELS: dict[str, str] = {
    "capcut_amarelo": "CapCut Amarelo",
    "capcut_ciano": "CapCut Ciano",
    "capcut_rosa": "CapCut Rosa",
    "capcut_branco": "CapCut Branco",
    "tiktok_neon": "TikTok Neon",
    "minimalista": "Minimalista",
    "minimal_branco": "Clean Branco",
    "youtube_caixa": "YouTube Caixa",
    "podcast": "Podcast",
    "cinema": "Cinema",
    "impacto_vermelho": "Impacto Vermelho",
    "suave_fade": "Suave Fade",
    "bounce_dourado": "Bounce Dourado",
    "slide_branco": "Slide Branco",
    "noticias": "Notícias",
    "gaming": "Gaming Roxo",
}

PRESETS: dict[str, dict] = {
    "capcut_amarelo": {
        "font": "Roboto", "font_size": 72,
        "primary_color": "#FACC15", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 8,
        "bold": True, "animation": "pop", "pop_scale": 115,
    },
    "capcut_ciano": {
        "font": "Roboto", "font_size": 72,
        "primary_color": "#22D3EE", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 8,
        "bold": True, "animation": "pop", "pop_scale": 115,
    },
    "capcut_rosa": {
        "font": "Montserrat", "font_size": 70,
        "primary_color": "#F472B6", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 7,
        "bold": True, "animation": "pop", "pop_scale": 118,
    },
    "capcut_branco": {
        "font": "Inter", "font_size": 68,
        "primary_color": "#FFFFFF", "secondary_color": "#E4E4E7",
        "outline_color": "#000000", "outline_width": 9,
        "bold": True, "animation": "pop", "pop_scale": 112,
    },
    "tiktok_neon": {
        "font": "Montserrat", "font_size": 74,
        "text_case": "upper",
        "primary_color": "#22D3EE", "secondary_color": "#FFFFFF",
        "outline_color": "#A855F7", "outline_width": 6,
        "bold": True, "animation": "bounce", "pop_scale": 125,
        "pop_duration_ms": 160,
    },
    "minimalista": {
        "font": "Open Sans", "font_size": 64,
        "primary_color": "#EC4899", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 2,
        "bold": False, "animation": "none",
    },
    "minimal_branco": {
        "font": "Lato", "font_size": 62,
        "primary_color": "#FFFFFF", "secondary_color": "#D4D4D8",
        "outline_color": "#000000", "outline_width": 3,
        "bold": False, "animation": "fade",
    },
    "youtube_caixa": {
        "font": "Roboto", "font_size": 56,
        "primary_color": "#FFFFFF", "secondary_color": "#CCCCCC",
        "outline_color": "#000000", "outline_width": 2,
        "bold": True, "animation": "none",
        "box": True, "box_color": "#000000", "box_opacity": 0.55,
    },
    "podcast": {
        "font": "Raleway", "font_size": 58,
        "primary_color": "#FDE047", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 3,
        "bold": True, "animation": "fade",
        "box": True, "box_color": "#18181B", "box_opacity": 0.65,
    },
    "cinema": {
        "font": "Raleway", "font_size": 60,
        "primary_color": "#FACC15", "secondary_color": "#FAFAFA",
        "outline_color": "#000000", "outline_width": 4,
        "bold": True, "italic": True, "animation": "fade",
        "box": True, "box_color": "#000000", "box_opacity": 0.45,
    },
    "impacto_vermelho": {
        "font": "Montserrat", "font_size": 76,
        "text_case": "upper",
        "primary_color": "#EF4444", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 10,
        "bold": True, "animation": "pop", "pop_scale": 122,
    },
    "suave_fade": {
        "font": "Open Sans", "font_size": 66,
        "primary_color": "#A5F3FC", "secondary_color": "#FFFFFF",
        "outline_color": "#0F172A", "outline_width": 5,
        "bold": True, "animation": "fade",
    },
    "bounce_dourado": {
        "font": "Roboto", "font_size": 72,
        "primary_color": "#FBBF24", "secondary_color": "#FFFFFF",
        "outline_color": "#000000", "outline_width": 8,
        "bold": True, "animation": "bounce", "pop_scale": 128,
        "pop_duration_ms": 180,
    },
    "slide_branco": {
        "font": "Inter", "font_size": 68,
        "primary_color": "#FFFFFF", "secondary_color": "#F4F4F5",
        "outline_color": "#000000", "outline_width": 7,
        "bold": True, "animation": "slide", "pop_duration_ms": 140,
    },
    "noticias": {
        "font": "Roboto", "font_size": 54,
        "text_case": "upper",
        "primary_color": "#FFFFFF", "secondary_color": "#E5E5E5",
        "outline_color": "#000000", "outline_width": 3,
        "bold": True, "animation": "none",
        "box": True, "box_color": "#DC2626", "box_opacity": 0.85,
    },
    "gaming": {
        "font": "Montserrat", "font_size": 70,
        "primary_color": "#C084FC", "secondary_color": "#FFFFFF",
        "outline_color": "#4C1D95", "outline_width": 6,
        "bold": True, "animation": "bounce", "pop_scale": 120,
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
    return {
        "presets": [
            {
                "id": k,
                "name": PRESET_LABELS.get(k, k.replace("_", " ").title()),
                "values": v,
            }
            for k, v in PRESETS.items()
        ]
    }
