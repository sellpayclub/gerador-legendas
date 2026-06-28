r"""Generate an ASS subtitle file with karaoke (\kf) word highlighting."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from presets import StyleConfig

_TRANSPARENT = "&HFF000000&"


def _hex_to_ass(color_hex: str) -> str:
    s = color_hex.lstrip("#")
    if len(s) == 8:
        a = int(s[0:2], 16)
        r, g, b = s[2:4], s[4:6], s[6:8]
    elif len(s) == 6:
        a = 0xFF
        r, g, b = s[0:2], s[2:4], s[4:6]
    else:
        return "&H00FFFFFF&"
    aa = 255 - a
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


def _group_words(words: list[dict], n: int) -> Iterable[list[dict]]:
    if n <= 1:
        for w in words:
            yield [w]
        return
    for i in range(0, len(words), n):
        yield words[i:i + n]


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
    anim = ""
    if cfg.animation == "pop":
        d = cfg.pop_duration_ms
        s = cfg.pop_scale
        anim = (
            f"\\t(0,{d // 2},\\fscx{s}\\fscy{s})"
            f"\\t({d // 2},{d},\\fscx100\\fscy100)"
        )
    elif cfg.animation == "fade":
        anim = "\\fad(120,80)"
    return f"{{{pos}{anim}}}"


def _pos_with_keyword_anim(
    cfg: StyleConfig,
    width: int,
    height: int,
    kw_times: list[tuple[float, float]] | None,
) -> str:
    """Position + line-level animation.

    Per-word keyword pop is handled inline in the karaoke body (see
    `_build_karaoke_body`), so this just returns the position + cfg.animation.
    Kept for backwards compatibility with the line-level pop fallback.
    """
    return _pos_and_anim(cfg, width, height)


def _keyword_inline_tags(rel_start_ms: float, rel_end_ms: float, scale: int) -> str:
    """Inline \\t tags that scale JUST the following word (pop on speak)."""
    rs = int(max(0, rel_start_ms))
    re_ = int(max(rs + 40, rel_end_ms))
    return (
        f"\\t({rs},{rs + 80},\\fscx{scale}\\fscy{scale})"
        f"\\t({re_},{re_ + 150},\\fscx100\\fscy100)"
    )


def _word_sep(cfg: StyleConfig, is_first: bool) -> str:
    if is_first:
        return " "
    return " " + " " * max(0, cfg.word_spacing // 4)


def _build_karaoke_body(
    group: list[dict],
    cfg: StyleConfig,
    line_start: float,
    kw_indices_in_group: list[int] | None,
) -> str:
    """Build the karaoke body. For keyword words, prepend inline \\t tags that
    scale JUST that word when it's spoken (per-word pop)."""
    kw_set = set(kw_indices_in_group or [])
    kw_scale = int(getattr(cfg, "keyword_scale", 180) or 180)
    parts: list[str] = []
    for i, w in enumerate(group):
        dur_cs = max(2, round((w["end"] - w["start"]) * 100))
        word_text = _escape_ass(_word_text(w))
        if not word_text:
            continue
        sep = _word_sep(cfg, not parts)
        if i in kw_set:
            rel_start_ms = (float(w["start"]) - line_start) * 1000.0
            rel_end_ms = (float(w["end"]) - line_start) * 1000.0
            kt = _keyword_inline_tags(rel_start_ms, rel_end_ms, kw_scale)
            parts.append(f"{sep}{{{kt}\\kf{dur_cs}}}{word_text}")
        else:
            parts.append(f"{sep}{{\\kf{dur_cs}}}{word_text}")
    return "".join(parts)


def _build_plain_body(
    group: list[dict],
    cfg: StyleConfig,
    line_start: float,
    kw_indices_in_group: list[int] | None,
) -> str:
    """Plain body (no karaoke color change) — but keyword words still pop."""
    kw_set = set(kw_indices_in_group or [])
    kw_scale = int(getattr(cfg, "keyword_scale", 180) or 180)
    parts: list[str] = []
    for i, w in enumerate(group):
        word_text = _escape_ass(_word_text(w))
        if not word_text:
            continue
        sep = _word_sep(cfg, not parts)
        if i in kw_set:
            rel_start_ms = (float(w["start"]) - line_start) * 1000.0
            rel_end_ms = (float(w["end"]) - line_start) * 1000.0
            kt = _keyword_inline_tags(rel_start_ms, rel_end_ms, kw_scale)
            parts.append(f"{sep}{{{kt}}}{word_text}")
        else:
            parts.append(f"{sep}{word_text}")
    return "".join(parts)


def generate_ass(
    words_data: dict,
    cfg: StyleConfig,
    words_per_line: int,
    out_path: Path,
    keyword_indices: list[int] | None = None,
) -> None:
    width = int(words_data.get("width", 1920))
    height = int(words_data.get("height", 1080))
    words = words_data.get("words", [])

    primary = _hex_to_ass(cfg.primary_color)
    secondary = _hex_to_ass(cfg.secondary_color)
    outline = _hex_to_ass(cfg.outline_color)
    box_colour = _colour_with_opacity(cfg.box_color, cfg.box_opacity)
    box_back = "&HFF000000&"
    box_pad = max(6, cfg.font_size // 8)
    bold_flag = -1 if cfg.bold else 0
    italic_flag = -1 if cfg.italic else 0
    ls = getattr(cfg, "letter_spacing", 2) or 0

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
        "Style: Caption,{font},{fs},{pri},{sec},{out},{out},"
        "{b},{it},0,0,100,100,{ls},0,1,{ow},{sh},5,40,40,{mv},1\n"
        "Style: CaptionBoxBack,{font},{fs},{t},{t},{box_c},{box_b},"
        "{b},{it},0,0,100,100,{ls},0,3,{box_pad},0,5,40,40,{mv},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
        "Effect, Text\n"
    ).format(
        w=width, h=height,
        font=cfg.font, fs=cfg.font_size,
        pri=primary, sec=secondary, out=outline,
        t=_TRANSPARENT, box_c=box_colour, box_b=box_back, box_pad=box_pad,
        b=bold_flag, it=italic_flag,
        ow=cfg.outline_width, sh=cfg.shadow, mv=cfg.margin_v,
        ls=ls,
    )

    if not words:
        out_path.write_text(header, encoding="utf-8")
        return

    kw_set = set(keyword_indices or [])
    lines: list[str] = [header]
    global_idx = 0
    for group in _group_words(words, words_per_line):
        start = group[0]["start"]
        end = group[-1]["end"] + 0.1
        t0, t1 = _fmt_time(start), _fmt_time(end)

        # Indices of keyword words WITHIN this group (0-based into the group).
        kw_in_group = [i for i, w in enumerate(group) if (global_idx + i) in kw_set]
        tag_prefix = _pos_and_anim(cfg, width, height)

        if cfg.box:
            plain = _build_plain_body(group, cfg, start, kw_in_group)
            if plain.strip():
                lines.append(
                    f"Dialogue: 0,{t0},{t1},CaptionBoxBack,,0,0,0,,{tag_prefix}{plain}\n"
                )
            karaoke = _build_karaoke_body(group, cfg, start, kw_in_group)
            if karaoke.strip():
                lines.append(
                    f"Dialogue: 1,{t0},{t1},Caption,,0,0,0,,{tag_prefix}{karaoke}\n"
                )
        else:
            karaoke = _build_karaoke_body(group, cfg, start, kw_in_group)
            lines.append(
                f"Dialogue: 0,{t0},{t1},Caption,,0,0,0,,{tag_prefix}{karaoke}\n"
            )

        global_idx += len(group)

    out_path.write_text("".join(lines), encoding="utf-8")
