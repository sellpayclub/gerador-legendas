"""Map StyleConfig font + bold/italic to libass Fontname (bundled backend/fonts/)."""
from __future__ import annotations

from presets import StyleConfig

# Names verified with fc-scan on bundled TTF files.
_FACE: dict[tuple[str, bool, bool], str] = {
    ("Roboto", False, False): "Roboto",
    ("Roboto", True, False): "Roboto Bold",
    ("Roboto", False, True): "Roboto Italic",
    ("Open Sans", False, False): "Open Sans Regular",
    ("Open Sans", True, False): "Open Sans Bold",
    ("Open Sans", False, True): "Open Sans Italic",
    ("Lato", False, False): "Lato Regular",
    ("Lato", True, False): "Lato Bold",
    ("Raleway", False, False): "Raleway Regular",
    ("Raleway", True, False): "Raleway Bold",
    ("Inter", False, False): "Inter",
    ("Inter", True, False): "Inter Bold",
    ("Montserrat", False, False): "Montserrat",
    ("Montserrat", True, False): "Montserrat Bold",
}


def ass_font_name(cfg: StyleConfig) -> str:
    """Exact font face name for libass when using fontsdir."""
    bold = bool(cfg.bold)
    italic = bool(cfg.italic)
    key = (cfg.font, bold, italic)
    if key in _FACE:
        return _FACE[key]
    if bold:
        fb = (cfg.font, True, False)
        if fb in _FACE:
            return _FACE[fb]
    if italic:
        fb = (cfg.font, False, True)
        if fb in _FACE:
            return _FACE[fb]
    return cfg.font


def ass_font_tag(cfg: StyleConfig) -> str:
    return f"\\fn{ass_font_name(cfg)}"


def ass_reset_style_tags(cfg: StyleConfig) -> str:
    """Inline tags after emoji/font switches — explicit face, no synthetic bold."""
    return f"{ass_font_tag(cfg)}\\b0\\i0"
