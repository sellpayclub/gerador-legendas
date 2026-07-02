"""Subtitle timing: trim word ends into silence and group lines by speech pauses."""
from __future__ import annotations

from typing import Iterable

# Keep in sync with ass_gen.KARAOKE_LEAD_S (avoid circular import at runtime).
KARAOKE_LEAD_S = 0.055
DEFAULT_PAUSE_THRESHOLD_S = 0.45
MIN_GAP_TRIM_S = 0.12
LINE_END_PAD_S = 0.05


def gap_after(words: list[dict], i: int) -> float:
    if i >= len(words) - 1:
        return 999.0
    return float(words[i + 1]["start"]) - float(words[i]["end"])


def trim_word_ends(words: list[dict], min_gap_s: float = MIN_GAP_TRIM_S) -> list[dict]:
    """Shorten word end timestamps so they don't bleed into silent gaps."""
    if not words:
        return words
    out: list[dict] = []
    for i, w in enumerate(words):
        nw = dict(w)
        end = float(nw["end"])
        if i < len(words) - 1:
            g = gap_after(words, i)
            if g > min_gap_s:
                trim_to = float(words[i + 1]["start"]) - min_gap_s * 0.5
                end = min(end, max(float(nw["start"]) + 0.04, trim_to))
        nw["end"] = round(end, 3)
        out.append(nw)
    return out


def group_words_by_pause(
    words: list[dict],
    max_words: int,
    pause_threshold_s: float = DEFAULT_PAUSE_THRESHOLD_S,
) -> list[list[dict]]:
    """Group words into on-screen lines; break on long pauses or max_words."""
    if not words:
        return []
    n = max(1, int(max_words))
    groups: list[list[dict]] = []
    current: list[dict] = []

    for i, w in enumerate(words):
        if current:
            g = gap_after(words, i - 1)
            if g > pause_threshold_s or len(current) >= n:
                groups.append(current)
                current = []
        current.append(w)

    if current:
        groups.append(current)
    return groups


def line_visibility_window(group: list[dict]) -> tuple[float, float]:
    """When a subtitle line is visible (speech only, not across long pauses)."""
    if not group:
        return 0.0, 0.0
    start = float(group[0]["start"]) - KARAOKE_LEAD_S
    end = float(group[-1]["end"]) + LINE_END_PAD_S
    return start, max(start + 0.02, end)


def non_overlapping_line_windows(
    groups: list[list[dict]],
) -> list[tuple[float, float]]:
    """Visibility windows clamped so consecutive lines never overlap in ASS."""
    if not groups:
        return []
    out: list[tuple[float, float]] = []
    for i, group in enumerate(groups):
        start, end = line_visibility_window(group)
        if i + 1 < len(groups):
            next_start, _ = line_visibility_window(groups[i + 1])
            end = min(end, next_start - 0.002)
        end = max(end, start + 0.01)
        out.append((start, end))
    return out


def group_words_iter(
    words: list[dict],
    max_words: int,
    pause_threshold_s: float = DEFAULT_PAUSE_THRESHOLD_S,
) -> Iterable[list[dict]]:
    return group_words_by_pause(words, max_words, pause_threshold_s)
