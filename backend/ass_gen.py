r"""Generate an ASS subtitle file with instant word highlighting (\k karaoke)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

from presets import StyleConfig
from fonts_util import ass_font_name, ass_reset_style_tags, ass_font_tag
from timing import (
    group_words_by_pause,
    non_overlapping_line_windows,
    trim_word_ends,
    DEFAULT_PAUSE_THRESHOLD_S,
)

_TRANSPARENT = "&HFF000000&"

# Highlight slightly BEFORE the transcribed word start so libass matches speech.
# Whisper timestamps run ~50–80 ms late; preview uses the same lead.
KARAOKE_LEAD_S = 0.055

EMOJI_FONT = "Noto Color Emoji"

_EMOJI_CHAR_RE = re.compile(
    r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF"
    r"\U0001F900-\U0001F9FF\U0001F1E0-\U0001F1FF"
    r"\U0000FE00-\U0000FE0F\U0000200D]+"
)


def _hex_to_ass(color_hex: str) -> str:
    s = color_hex.lstrip("#")
    if len(s) == 8:
        # CSS #RRGGBBAA format (alpha is LAST two digits)
        r, g, b, a = s[0:2], s[2:4], s[4:6], s[6:8]
    elif len(s) == 6:
        a = "FF"
        r, g, b = s[0:2], s[2:4], s[4:6]
    else:
        return "&H00FFFFFF&"
    aa = 255 - int(a, 16)
    return f"&H{aa:02X}{b}{g}{r}&".upper()


def _fmt_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def _escape_ass(text: str) -> str:
    text = text.strip().replace("\n", " ").replace("\r", " ")
    text = text.replace("\\", "\\\\")
    text = text.replace("{", "\\{").replace("}", "\\}")
    return text


def _word_text(w: dict) -> str:
    return (w.get("w") or "").strip()


def _apply_text_case(text: str, cfg: StyleConfig) -> str:
    case = getattr(cfg, "text_case", "normal") or "normal"
    if case == "upper":
        return text.upper()
    if case == "lower":
        return text.lower()
    return text


def _ass_word_runs(text: str, cfg: StyleConfig) -> str:
    """Escape word text; switch to Noto Color Emoji for emoji codepoints."""
    if not text:
        return ""
    body = _apply_text_case(text, cfg)
    font_tag = ass_reset_style_tags(cfg)
    parts: list[str] = []
    last = 0
    for m in _EMOJI_CHAR_RE.finditer(body):
        if m.start() > last:
            parts.append(_escape_ass(body[last:m.start()]))
        emoji = m.group(0)
        parts.append(f"{{\\fn{EMOJI_FONT}}}{_escape_ass(emoji)}{{{font_tag}}}")
        last = m.end()
    if last < len(body):
        parts.append(_escape_ass(body[last:]))
    return "".join(parts) if parts else _escape_ass(body)


def _display_word(w: dict, cfg: StyleConfig) -> str:
    return _ass_word_runs(_word_text(w), cfg)


def _group_words(
    words: list[dict],
    n: int,
    pause_threshold_s: float = DEFAULT_PAUSE_THRESHOLD_S,
) -> Iterable[list[dict]]:
    return group_words_by_pause(words, n, pause_threshold_s)


def _colour_with_opacity(color_hex: str, opacity: float) -> str:
    s = color_hex.lstrip("#")
    if len(s) == 6:
        r, g, b = s[0:2], s[2:4], s[4:6]
    else:
        return "&H80000000&"
    aa = int((1.0 - max(0.0, min(1.0, opacity))) * 255)
    return f"&H{aa:02X}{b}{g}{r}&".upper()


def _pos_and_anim(cfg: StyleConfig, width: int, height: int) -> str:
    px = cfg.pos_x if cfg.pos_x is not None else width / 2
    py = cfg.pos_y if cfg.pos_y is not None else height - cfg.margin_v
    pos = f"\\an5\\pos({px:.1f},{py:.1f})"
    font = ass_font_tag(cfg)
    anim = ""
    if cfg.animation == "pop":
        d = cfg.pop_duration_ms
        s = cfg.pop_scale
        anim = (
            f"\\t(0,{d // 2},\\fscx{s}\\fscy{s})"
            f"\\t({d // 2},{d},\\fscx100\\fscy100)"
        )
    elif cfg.animation == "bounce":
        d = max(80, cfg.pop_duration_ms)
        s = cfg.pop_scale
        mid = 100 + (s - 100) // 2
        anim = (
            f"\\t(0,{d // 3},\\fscx{s}\\fscy{s})"
            f"\\t({d // 3},{2 * d // 3},\\fscx{mid}\\fscy{mid})"
            f"\\t({2 * d // 3},{d},\\fscx100\\fscy100)"
        )
    elif cfg.animation == "slide":
        d = max(60, cfg.pop_duration_ms)
        anim = f"\\fad({d},40)"
    elif cfg.animation == "fade":
        anim = "\\fad(40,30)"
    outline = ""
    ow = max(0, min(24, int(cfg.outline_width)))
    if ow > 0:
        oc = _hex_to_ass(cfg.outline_color)
        outline = f"\\3c{oc}\\bord{ow}\\be0"
    return f"{{{font}{pos}{anim}{outline}\\b0\\i0}}"


def _word_sep(cfg: StyleConfig, is_first: bool) -> str:
    if is_first:
        return " "
    return " " + " " * max(0, cfg.word_spacing // 4)


def _build_karaoke_body(
    group: list[dict],
    cfg: StyleConfig,
    line_start: float,
    pri: str,
    sec: str,
) -> str:
    """Instant per-word colour snap — no gradient, no karaoke fill.

    Uses \\t(t,t,\\1c…) with identical start/end times so libass applies the
    colour change in one frame (\\t with t1≠t2 interpolates and looks gradual).
    """
    parts: list[str] = []
    for w in group:
        word_text = _display_word(w, cfg)
        if not word_text:
            continue
        ws = max(0, int((float(w["start"]) - line_start - KARAOKE_LEAD_S) * 1000))
        we = max(ws + 1, int((float(w["end"]) - line_start) * 1000))
        sep = _word_sep(cfg, not parts)
        # Snap primary at ws, snap back to secondary at we — never interpolate (t1=t2).
        parts.append(
            f"{sep}{{\\1c{sec}\\t({ws},{ws},\\1c{pri})"
            f"\\t({we},{we},\\1c{sec})}}{word_text}"
        )
    return "".join(parts)


def _build_plain_body(group: list[dict], cfg: StyleConfig) -> str:
    parts: list[str] = []
    for w in group:
        word_text = _display_word(w, cfg)
        if not word_text:
            continue
        sep = _word_sep(cfg, not parts)
        parts.append(f"{sep}{word_text}")
    return "".join(parts)


def _overlaps_phrase(start: float, end: float, phrases: list[dict]) -> bool:
    for ph in phrases:
        if start < float(ph["end"]) and end > float(ph["start"]):
            return True
    return False


def _fit_hero(text: str, width: int, height: int) -> tuple[str, int]:
    """Single centered line (1–2 words). Sized to stay inside the frame."""
    line = _escape_ass(text.strip())
    n_chars = max(len(text.strip()), 1)
    # Bold sans ≈ 0.62×fs per char; leave ~15% margin each side.
    fs_by_w = int((width * 0.70) / (n_chars * 0.62))
    # Cap height — text + outline must stay well inside the frame.
    fs_by_h = int(height * 0.065)
    fs = max(36, min(fs_by_w, fs_by_h, int(height * 0.075)))
    return line, fs


def _hero_dialogues(
    phrases: list[dict],
    cfg: StyleConfig,
    width: int,
    height: int,
) -> list[str]:
    """One centered line per moment — timed to the selected word(s)."""
    cx, cy = width / 2, height / 2
    lines: list[str] = []
    for ph in phrases:
        start = float(ph["start"])
        end = float(ph["end"]) + 0.08
        t0, t1 = _fmt_time(start), _fmt_time(end)
        raw = (ph.get("text") or "").strip()
        if not raw:
            continue
        ass_text, fs = _fit_hero(_apply_text_case(raw, cfg), width, height)
        ow = min(6, max(4, fs // 18))
        tags = (
            f"{{\\fn{ass_font_name(cfg)}\\an5\\pos({cx:.1f},{cy:.1f})\\fs{fs}\\q2\\bord{ow}"
            f"\\clip(0,0,{width},{height})"
            f"\\fscx96\\fscy96\\t(0,140,\\fscx100\\fscy100)"
            f"\\fad(120,180)\\b0\\i0}}"
        )
        lines.append(
            f"Dialogue: 2,{t0},{t1},HighlightHero,,0,0,0,,{tags}{ass_text}\n"
        )
    return lines


def generate_ass(
    words_data: dict,
    cfg: StyleConfig,
    words_per_line: int,
    out_path: Path,
    keyword_indices: list[int] | None = None,
    highlight_enabled: bool = False,
    highlight_phrases: list[dict] | None = None,
    pause_threshold_s: float | None = None,
) -> None:
    width = int(words_data.get("width", 1920))
    height = int(words_data.get("height", 1080))
    words = trim_word_ends(words_data.get("words", []))

    primary = _hex_to_ass(cfg.primary_color)
    secondary = _hex_to_ass(cfg.secondary_color)
    outline = _hex_to_ass(cfg.outline_color)
    outline_w = max(0, min(24, int(cfg.outline_width)))
    transparent_back = "&H80000000&"
    box_colour = _colour_with_opacity(cfg.box_color, cfg.box_opacity)
    box_back = "&HFF000000&"
    box_pad = max(6, cfg.font_size // 8)
    font_name = ass_font_name(cfg)
    # Explicit font face in Style — Bold/Italic flags off (weight is in the name).
    bold_flag = 0
    italic_flag = 0
    ls = getattr(cfg, "letter_spacing", 2) or 0

    hero_fs = int(height * 0.07)
    hero_ow = 6

    header = (
        "[Script Info]\n"
        "; Script generated by legendas-locais\n"
        "ScriptType: v4.00+\n"
        "PlayResX: {w}\n"
        "PlayResY: {h}\n"
        "WrapStyle: 2\n"
        "ScaledBorderAndShadow: yes\n"
        "YCbCr Matrix: TV.709\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Caption,{font},{fs},{pri},{sec},{out},{tback},"
        "{b},{it},0,0,100,100,{ls},0,1,{ow},{sh},5,40,40,{mv},1\n"
        "Style: CaptionBoxBack,{font},{fs},{t},{t},{box_c},{box_b},"
        "{b},{it},0,0,100,100,{ls},0,3,{box_pad},0,5,40,40,{mv},1\n"
        "Style: HighlightHero,{font},{hfs},{pri},{pri},{out},{tback},"
        "{b},{it},0,0,100,100,{ls},0,1,{how},6,5,40,40,0,1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
        "Effect, Text\n"
    ).format(
        w=width, h=height,
        font=font_name, fs=cfg.font_size,
        hfs=hero_fs, how=hero_ow,
        pri=primary, sec=secondary, out=outline, tback=transparent_back,
        t=_TRANSPARENT, box_c=box_colour, box_b=box_back, box_pad=box_pad,
        b=bold_flag, it=italic_flag,
        ow=outline_w, sh=cfg.shadow, mv=cfg.margin_v,
        ls=ls,
    )

    if not words:
        out_path.write_text(header, encoding="utf-8")
        return

    phrases = highlight_phrases if highlight_enabled and highlight_phrases else []
    lines: list[str] = [header]

    pause_s = pause_threshold_s if pause_threshold_s is not None else DEFAULT_PAUSE_THRESHOLD_S
    groups_list = group_words_by_pause(words, words_per_line, pause_s)
    line_windows = non_overlapping_line_windows(groups_list)
    for gi, group in enumerate(groups_list):
        line_start, line_end = line_windows[gi]
        start = line_start
        end = line_end
        t0, t1 = _fmt_time(start), _fmt_time(end)

        # During a hero moment, hide the bottom caption so the big phrase stands out.
        if phrases and _overlaps_phrase(start, end, phrases):
            continue

        tag_prefix = _pos_and_anim(cfg, width, height)

        if cfg.box:
            plain = _build_plain_body(group, cfg)
            if plain.strip():
                lines.append(
                    f"Dialogue: 0,{t0},{t1},CaptionBoxBack,,0,0,0,,{tag_prefix}{plain}\n"
                )
            karaoke = _build_karaoke_body(group, cfg, line_start, primary, secondary)
            if karaoke.strip():
                lines.append(
                    f"Dialogue: 1,{t0},{t1},Caption,,0,0,0,,{tag_prefix}{karaoke}\n"
                )
        else:
            karaoke = _build_karaoke_body(group, cfg, line_start, primary, secondary)
            lines.append(
                f"Dialogue: 0,{t0},{t1},Caption,,0,0,0,,{tag_prefix}{karaoke}\n"
            )

    if phrases:
        lines.extend(_hero_dialogues(phrases, cfg, width, height))

    out_path.write_text("".join(lines), encoding="utf-8")
