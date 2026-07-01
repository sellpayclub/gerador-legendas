"""Auto-detect short-form clips (1–3 min insights) from long transcripts."""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from timing import gap_after

load_dotenv()

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("CLIPS_MODEL", "gpt-4o-mini")

MIN_CLIP_S = 45.0
TARGET_MIN_S = 60.0
TARGET_MAX_S = 180.0
PAUSE_SNAP_S = 0.45
MAX_CLIPS = 8
CHUNK_WORDS = 500
SINGLE_PASS_WORDS = 1500
MIN_CLIP_SCORE = 0.75


def _cache_path(job_dir: Path) -> Path:
    return job_dir / "clips.json"


def load_clips(job_dir: Path) -> Optional[dict]:
    p = _cache_path(job_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_clips(job_dir: Path, payload: dict) -> dict:
    payload["ts"] = time.time()
    payload.setdefault("detecting", False)
    payload.setdefault("detect_error", None)
    _cache_path(job_dir).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def mark_detecting(job_dir: Path) -> None:
    prev = load_clips(job_dir) or {}
    save_clips(job_dir, {
        "clips": prev.get("clips") or [],
        "model": prev.get("model", DEFAULT_MODEL),
        "manual": prev.get("manual", False),
        "detecting": True,
        "detect_error": None,
    })


def mark_detect_error(job_dir: Path, message: str) -> None:
    prev = load_clips(job_dir) or {}
    save_clips(job_dir, {
        "clips": prev.get("clips") or [],
        "model": prev.get("model", DEFAULT_MODEL),
        "manual": prev.get("manual", False),
        "detecting": False,
        "detect_error": message,
    })


def clip_count(job_dir: Path) -> int:
    data = load_clips(job_dir)
    if not data:
        return 0
    return len(data.get("clips") or [])


def slice_words(words: list[dict], t0: float, t1: float) -> list[dict]:
    """Words inside [t0, t1], timestamps shifted to start at 0."""
    out: list[dict] = []
    for w in words:
        ws = float(w["start"])
        we = float(w["end"])
        if we <= t0 or ws >= t1:
            continue
        out.append({
            "w": w.get("w", ""),
            "start": round(max(0.0, ws - t0), 3),
            "end": round(min(t1 - t0, we - t0), 3),
        })
    return out


def clip_bounds_from_indices(
    words: list[dict],
    i0: int,
    i1: int,
    *,
    title: str = "",
    hook: str = "",
    score: float = 0.0,
    clip_id: str | None = None,
) -> dict:
    i0 = max(0, min(i0, len(words) - 1))
    i1 = max(i0, min(i1, len(words) - 1))
    start_s = float(words[i0]["start"])
    end_s = float(words[i1]["end"])
    text = " ".join((words[i].get("w") or "").strip() for i in range(i0, i1 + 1)).strip()
    return {
        "id": clip_id or f"clip_{uuid.uuid4().hex[:8]}",
        "title": title or f"Corte {i0}–{i1}",
        "hook": hook,
        "score": score,
        "start_word_idx": i0,
        "end_word_idx": i1,
        "start_s": round(start_s, 3),
        "end_s": round(end_s, 3),
        "duration_s": round(end_s - start_s, 3),
        "preview": text[:120] + ("…" if len(text) > 120 else ""),
        "insight": hook,
        "enabled": True,
        "status": "pending",
    }


def _snap_start_to_pause(words: list[dict], idx: int) -> int:
    """Move start index earlier to nearest pause before idx."""
    idx = max(0, min(idx, len(words) - 1))
    while idx > 0:
        g = gap_after(words, idx - 1)
        if g >= PAUSE_SNAP_S:
            break
        idx -= 1
    return idx


def _snap_end_to_pause(words: list[dict], idx: int) -> int:
    """Move end index later to nearest pause after idx."""
    idx = max(0, min(idx, len(words) - 1))
    while idx < len(words) - 1:
        g = gap_after(words, idx)
        if g >= PAUSE_SNAP_S:
            break
        idx += 1
    return idx


def _expand_to_min_duration(words: list[dict], i0: int, i1: int, min_s: float) -> tuple[int, int]:
    while i0 > 0 and float(words[i1]["end"]) - float(words[i0]["start"]) < min_s:
        i0 = max(0, _snap_start_to_pause(words, i0) - 1)
        if i0 == 0:
            break
    while i1 < len(words) - 1 and float(words[i1]["end"]) - float(words[i0]["start"]) < min_s:
        i1 = min(len(words) - 1, _snap_end_to_pause(words, i1) + 1)
        if i1 >= len(words) - 1:
            break
    return i0, i1


def _shrink_to_max_duration(words: list[dict], i0: int, i1: int, max_s: float) -> tuple[int, int]:
    while i1 > i0 and float(words[i1]["end"]) - float(words[i0]["start"]) > max_s:
        i1 -= 1
    return i0, i1


def _normalize_clip(words: list[dict], raw: dict) -> dict | None:
    try:
        i0 = int(raw.get("start_word_idx", raw.get("start_idx", 0)))
        i1 = int(raw.get("end_word_idx", raw.get("end_idx", i0)))
    except (TypeError, ValueError):
        return None
    if not words:
        return None
    i0 = max(0, min(i0, len(words) - 1))
    i1 = max(i0, min(i1, len(words) - 1))

    i0 = _snap_start_to_pause(words, i0)
    i1 = _snap_end_to_pause(words, i1)
    i0, i1 = _expand_to_min_duration(words, i0, i1, TARGET_MIN_S)
    i0, i1 = _shrink_to_max_duration(words, i0, i1, TARGET_MAX_S)

    dur = float(words[i1]["end"]) - float(words[i0]["start"])
    if dur < MIN_CLIP_S:
        return None

    score = float(raw.get("score") or 0.5) if raw.get("score") is not None else 0.5
    if score < MIN_CLIP_SCORE:
        return None

    hook = str(raw.get("hook") or raw.get("reason") or "").strip()
    insight = str(raw.get("insight") or hook).strip()
    clip = clip_bounds_from_indices(
        words, i0, i1,
        title=str(raw.get("title") or "Corte").strip(),
        hook=hook or insight,
        score=score,
    )
    if insight:
        clip["insight"] = insight
    return clip


def _remove_overlaps(clips: list[dict]) -> list[dict]:
    if not clips:
        return []
    sorted_clips = sorted(clips, key=lambda c: (-float(c.get("score") or 0), c["start_s"]))
    kept: list[dict] = []
    for c in sorted_clips:
        overlap = False
        for k in kept:
            if c["start_s"] < k["end_s"] and c["end_s"] > k["start_s"]:
                overlap = True
                break
        if not overlap:
            kept.append(c)
    kept.sort(key=lambda c: c["start_s"])
    return kept[:MAX_CLIPS]


def _transcript_blocks(words: list[dict], block_size: int = CHUNK_WORDS) -> list[str]:
    lines: list[str] = []
    for i in range(0, len(words), block_size):
        chunk = words[i:i + block_size]
        parts = [f"{i + j}:{w.get('w', '')}@{float(w['start']):.1f}s" for j, w in enumerate(chunk)]
        lines.append(" ".join(parts))
    return lines


def _openai_json(system: str, user: str, *, max_tokens: int = 2500) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada em backend/.env")

    import requests
    resp = requests.post(
        OPENAI_CHAT_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": DEFAULT_MODEL,
            "temperature": 0.3,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=180,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI chat error {resp.status_code}: {resp.text[:400]}")
    raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content") or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _clip_selection_system(lang_hint: str, target: int, duration: float, word_count: int) -> str:
    return (
        "You are a senior short-form video editor (Reels/TikTok/Shorts)." + lang_hint +
        f"\n\nFrom a long video transcript ({duration:.0f}s, {word_count} words), "
        f"select exactly the best {target} clips (60–180 seconds each).\n\n"
        "Each clip MUST have a clear narrative arc:\n"
        "1. INÍCIO (hook): question, bold claim, or minimal context that grabs attention\n"
        "2. MEIO (development): argument, example, story, or explanation\n"
        "3. FIM (payoff): actionable insight, conclusion, punchline, or takeaway\n\n"
        "REJECT clips that are:\n"
        "- Generic intros/outros, 'thanks for watching', filler transitions\n"
        "- Mid-thought without setup or payoff\n"
        "- Lacking a specific, valuable insight the viewer can use\n\n"
        "Each clip must be self-contained (viewer understands without the full video).\n"
        "Do NOT cut mid-sentence. Include minimal setup if the payoff needs it.\n"
        "Pick ONLY the highest-value moments — do NOT span the entire video.\n\n"
        "Return JSON:\n"
        '{"clips":[{"title":"short title","hook":"opening hook in one line",'
        '"insight":"the valuable takeaway in one sentence",'
        '"start_word_idx":120,"end_word_idx":340,"score":0.92}]}\n'
        "Use 0-based word indices from the FULL transcript. "
        "score 0–1 (only include clips with score >= 0.75). Clips must not overlap."
    )


def _summarize_block_system(lang_hint: str) -> str:
    return (
        "You analyze transcript segments for short-form video editing." + lang_hint +
        "\n\nFor each segment, identify 0–2 candidate clip ranges with strong insights.\n"
        "Each candidate needs hook + development + payoff potential.\n\n"
        "Return JSON:\n"
        '{"candidates":[{"title":"...","insight":"valuable takeaway",'
        '"start_word_idx":120,"end_word_idx":340,"score":0.85,"themes":"brief theme"}]}\n'
        "Use the global word indices shown in the transcript. "
        "Skip generic filler. score >= 0.75 only."
    )


def _transcript_full(words: list[dict]) -> str:
    parts = [f"{i}:{w.get('w', '')}@{float(w['start']):.1f}s" for i, w in enumerate(words)]
    return " ".join(parts)


def _call_gpt_clips(words: list[dict], duration: float, language: str) -> list[dict]:
    lang_hint = ""
    if language and language != "auto":
        lang_hint = f" The spoken language is {language}."
    else:
        lang_hint = " Detect the language from the transcript."

    target = max(2, min(MAX_CLIPS, int(duration / 180) + 1))
    all_raw: list[dict] = []

    if len(words) <= SINGLE_PASS_WORDS:
        system = _clip_selection_system(lang_hint, target, duration, len(words))
        data = _openai_json(system, _transcript_full(words), max_tokens=4000)
        all_raw.extend(data.get("clips") or [])
    else:
        # Pass 1: summarize each block and collect candidates
        candidates: list[dict] = []
        blocks = _transcript_blocks(words)
        sum_system = _summarize_block_system(lang_hint)
        for block in blocks:
            data = _openai_json(sum_system, block, max_tokens=2000)
            candidates.extend(data.get("candidates") or data.get("clips") or [])

        # Pass 2: pick best clips from consolidated candidates
        if candidates:
            cand_lines = []
            for c in candidates:
                cand_lines.append(
                    f"- idx {c.get('start_word_idx')}–{c.get('end_word_idx')}: "
                    f"score={c.get('score', 0)} title={c.get('title', '')} "
                    f"insight={c.get('insight', c.get('hook', ''))}"
                )
            pick_system = _clip_selection_system(lang_hint, target, duration, len(words))
            pick_user = (
                f"Video has {len(words)} words ({duration:.0f}s).\n"
                f"Pre-analyzed candidates:\n" + "\n".join(cand_lines) +
                "\n\nFull transcript (word_idx:word@time):\n" + _transcript_full(words)
            )
            data = _openai_json(pick_system, pick_user, max_tokens=4000)
            all_raw.extend(data.get("clips") or [])
        else:
            blocks = _transcript_blocks(words)
            system = _clip_selection_system(lang_hint, target, duration, len(words))
            for block in blocks:
                data = _openai_json(system, block, max_tokens=2500)
                all_raw.extend(data.get("clips") or [])

    normalized: list[dict] = []
    for raw in all_raw:
        clip = _normalize_clip(words, raw)
        if clip:
            normalized.append(clip)

    return _remove_overlaps(normalized)


def detect_clips(
    words: list[dict],
    job_dir: Path,
    *,
    duration: float,
    language: str = "auto",
    force: bool = False,
) -> dict:
    if not force:
        cached = load_clips(job_dir)
        if cached and cached.get("clips"):
            return cached

    if not words:
        prev = load_clips(job_dir) or {}
        payload = _merge_settings(prev)
        payload.update({"clips": [], "model": DEFAULT_MODEL, "manual": False})
        return save_clips(job_dir, payload)

    detected = _call_gpt_clips(words, duration, language)
    prev = load_clips(job_dir) or {}
    payload = _merge_settings(prev)
    payload.update({
        "clips": detected,
        "model": DEFAULT_MODEL,
        "manual": False,
        "detecting": False,
        "detect_error": None,
    })
    return save_clips(job_dir, payload)


def update_clips(job_dir: Path, clips: list[dict], *, manual: bool = True) -> dict:
    prev = load_clips(job_dir) or {}
    out: list[dict] = []
    for c in clips:
        item = dict(c)
        item.setdefault("status", "pending")
        item.setdefault("enabled", True)
        if "duration_s" not in item and "start_s" in item and "end_s" in item:
            item["duration_s"] = round(float(item["end_s"]) - float(item["start_s"]), 3)
        out.append(item)
    payload = _merge_settings(prev)
    payload.update({
        "clips": out,
        "model": prev.get("model", DEFAULT_MODEL),
        "manual": manual,
    })
    return save_clips(job_dir, payload)


def _merge_settings(prev: dict) -> dict:
    """Preserve style/settings fields when updating clips list."""
    keys = (
        "style", "preset", "words_per_line", "aspect", "template", "resolution",
        "highlight_enabled", "overlay_asset", "profile_asset", "instagram_username",
        "logo_asset", "logo_x", "logo_y", "logo_scale", "progress_enabled",
        "progress_color", "progress_height_pct", "headline_style", "headline_bg",
        "headline_color", "headline_font_size", "headline_align", "headline_max_width_pct",
        "overlay_pos_x",
        "overlay_pos_y", "video_pos_x", "video_pos_y", "ig_bg_color", "ig_text_color",
        "ig_avatar_size", "ig_username_size", "ig_caption_size",
    )
    return {k: prev[k] for k in keys if k in prev}


def update_settings(job_dir: Path, settings: dict) -> dict:
    prev = load_clips(job_dir) or {"clips": []}
    allowed = (
        "style", "preset", "words_per_line", "aspect", "template", "resolution",
        "highlight_enabled", "overlay_asset", "profile_asset", "instagram_username",
        "logo_asset", "logo_x", "logo_y", "logo_scale", "progress_enabled",
        "progress_color", "progress_height_pct", "headline_style", "headline_bg",
        "headline_color", "headline_font_size", "headline_align", "headline_max_width_pct",
        "overlay_pos_x",
        "overlay_pos_y", "video_pos_x", "video_pos_y", "ig_bg_color", "ig_text_color",
        "ig_avatar_size", "ig_username_size", "ig_caption_size",
    )
    for k in allowed:
        if k in settings:
            prev[k] = settings[k]
    return save_clips(job_dir, prev)


def clip_keywords_path(job_dir: Path, clip_id: str) -> Path:
    return clip_dir(job_dir, clip_id) / "keywords.json"


def _load_clip_keywords_cache(job_dir: Path, clip_id: str) -> Optional[dict]:
    p = clip_keywords_path(job_dir, clip_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_clip_keywords_cache(
    job_dir: Path,
    clip_id: str,
    indices: list[int],
    *,
    manual: bool,
    effects: dict | None = None,
) -> dict:
    import keywords as kw_mod
    p = clip_keywords_path(job_dir, clip_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    prev = _load_clip_keywords_cache(job_dir, clip_id) or {}
    payload = {
        "indices": indices,
        "manual": manual,
        "model": prev.get("model", kw_mod.DEFAULT_MODEL),
        "effects": effects if effects is not None else prev.get("effects") or {},
        "ts": time.time(),
    }
    p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def load_clip_keywords(job_dir: Path, clip_id: str, words: list[dict]) -> dict:
    import keywords as kw_mod
    cached = _load_clip_keywords_cache(job_dir, clip_id)
    indices = (cached or {}).get("indices") or []
    effects = (cached or {}).get("effects") or {}
    return {
        "indices": indices,
        "phrases": kw_mod.group_highlight_phrases(words, indices),
        "effects": effects,
        "manual": bool((cached or {}).get("manual")),
    }


def detect_clip_keywords(
    words: list[dict],
    job_dir: Path,
    clip_id: str,
    language: str = "auto",
    *,
    force: bool = False,
) -> dict:
    import keywords as kw_mod
    if not force:
        cached = _load_clip_keywords_cache(job_dir, clip_id)
        if cached and cached.get("indices"):
            return load_clip_keywords(job_dir, clip_id, words)
    indices = kw_mod._call_gpt(words, language)
    _save_clip_keywords_cache(job_dir, clip_id, indices, manual=False)
    return load_clip_keywords(job_dir, clip_id, words)


def save_clip_keywords(
    job_dir: Path,
    clip_id: str,
    indices: list[int],
    words: list[dict],
    effects: dict | None = None,
) -> dict:
    _save_clip_keywords_cache(job_dir, clip_id, indices, manual=True, effects=effects)
    return load_clip_keywords(job_dir, clip_id, words)


def clip_words_path(job_dir: Path, clip_id: str) -> Path:
    return clip_dir(job_dir, clip_id) / "words.json"


def load_clip_words(job_dir: Path, clip_id: str) -> Optional[list[dict]]:
    p = clip_words_path(job_dir, clip_id)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("words") if isinstance(data, dict) else data
    except Exception:
        return None


def save_clip_words(job_dir: Path, clip_id: str, words: list[dict]) -> list[dict]:
    p = clip_words_path(job_dir, clip_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"words": words}, ensure_ascii=False), encoding="utf-8")
    return words


def words_for_render(job_dir: Path, global_words: list[dict], clip: dict) -> list[dict]:
    """Clip-specific words if saved, else slice from global transcript."""
    override = load_clip_words(job_dir, clip["id"])
    if override:
        return override
    return slice_words(global_words, float(clip["start_s"]), float(clip["end_s"]))


def get_clip(job_dir: Path, clip_id: str) -> dict | None:
    data = load_clips(job_dir)
    if not data:
        return None
    for c in data.get("clips") or []:
        if c.get("id") == clip_id:
            return c
    return None


def clip_output_path(job_dir: Path, clip_id: str) -> Path:
    return job_dir / "clips" / clip_id / "output.mp4"


def clip_dir(job_dir: Path, clip_id: str) -> Path:
    d = job_dir / "clips" / clip_id
    d.mkdir(parents=True, exist_ok=True)
    return d
