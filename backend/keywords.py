"""Keyword detection via OpenAI GPT-4o-mini.

Given a transcript (list of {w, start, end} dicts), ask GPT to pick the most
impactful words for emphasis (zoom). Returns a list of word indices (0-based)
into the transcript.

Cached per job at data/jobs/{id}/keywords.json. The user can override the
selection via PUT /api/jobs/{id}/keywords, which writes the same file with
"manual": true so we don't re-call the API and clobber their edits.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from openai_chat import chat_text
from app_settings import get_keywords_model

load_dotenv()
# Approx. how many words to highlight. 15% feels punchy on short videos and
# not overwhelming on longer ones. Capped so very long transcripts don't get
# too busy.
MAX_WORDS_PER_MOMENT = 2   # show 1–2 words per highlight, exactly as selected
HOLD_S = 0.12              # tiny tail after last word ends


def _cache_path(job_dir: Path) -> Path:
    return job_dir / "keywords.json"


def load_cached(job_dir: Path) -> Optional[dict]:
    p = _cache_path(job_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_cache(
    job_dir: Path,
    indices: list[int],
    *,
    manual: bool,
    model: str = get_keywords_model(),
    effects: dict | None = None,
) -> dict:
    payload = {
        "indices": indices,
        "manual": manual,
        "model": model,
        "effects": effects if effects is not None else {},
        "ts": time.time(),
    }
    try:
        _cache_path(job_dir).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    return payload


def load_effects(job_dir: Path) -> dict:
    cached = load_cached(job_dir)
    if cached and isinstance(cached.get("effects"), dict):
        return cached["effects"]
    return {}


def load_keywords(words: list[dict], job_dir: Path) -> dict:
    """Return saved keyword/effect data only — never calls GPT."""
    cached = load_cached(job_dir)
    if cached and "indices" in cached:
        indices = cached.get("indices") or []
        return _result(
            words, indices, bool(cached.get("manual")),
            cached.get("model", get_keywords_model()), job_dir,
        )
    return _result(words, [], False, get_keywords_model(), job_dir)


def detect_keywords(words: list[dict], job_dir: Path, language: str = "auto") -> dict:
    """Detect impactful short phrases via GPT.

    Returns {indices, phrases, words_preview, manual, model}.
    Uses cache when available; otherwise calls the API.
    """
    cached = load_cached(job_dir)
    if cached and cached.get("indices"):
        indices = cached["indices"]
        return _result(words, indices, bool(cached.get("manual")), cached.get("model", get_keywords_model()), job_dir)
    indices = _call_gpt(words, language)
    save_cache(job_dir, indices, manual=False)
    return _result(words, indices, False, get_keywords_model(), job_dir)


def _result(words: list[dict], indices: list[int], manual: bool, model: str, job_dir: Path) -> dict:
    phrases = group_highlight_phrases(words, indices)
    effects = load_effects(job_dir)
    return {
        "indices": indices,
        "phrases": phrases,
        "effects": effects,
        "words_preview": _preview(words, indices),
        "manual": manual,
        "model": model,
    }


def save_manual(
    job_dir: Path,
    indices: list[int],
    words: list[dict] | None = None,
    effects: dict | None = None,
) -> dict:
    """Persist the user's manually edited keyword selection."""
    prev = load_cached(job_dir) or {}
    fx = effects if effects is not None else prev.get("effects") or {}
    save_cache(job_dir, indices, manual=True, effects=fx)
    phrases = group_highlight_phrases(words or [], indices) if words else []
    return {"indices": indices, "phrases": phrases, "effects": fx, "manual": True}


def group_highlight_phrases(
    words: list[dict],
    indices: list[int],
    *,
    max_words: int = MAX_WORDS_PER_MOMENT,
    hold_s: float = HOLD_S,
) -> list[dict]:
    """Build highlight moments from the user's selected word indices.

    Rules (strict — no extra words added):
    - Only indices the user selected are shown.
    - Consecutive selected words may appear together (max 2 per moment).
    - Non-consecutive selections = separate moments, each timed to the word(s).
    """
    if not indices or not words:
        return []

    selected = sorted({i for i in indices if 0 <= i < len(words)})
    if not selected:
        return []

    # Consecutive runs in transcript order.
    runs: list[list[int]] = []
    run = [selected[0]]
    for idx in selected[1:]:
        if idx == run[-1] + 1:
            run.append(idx)
        else:
            runs.append(run)
            run = [idx]
    runs.append(run)

    moments: list[dict] = []
    for run in runs:
        for i in range(0, len(run), max_words):
            chunk = run[i:i + max_words]
            text = " ".join((words[j].get("w") or "").strip() for j in chunk).strip()
            if not text:
                continue
            start = float(words[chunk[0]]["start"])
            end = float(words[chunk[-1]]["end"]) + hold_s
            moments.append({"indices": chunk, "start": start, "end": end, "text": text})
    return moments


def _preview(words: list[dict], indices: list[int]) -> list[str]:
    out = []
    for i in indices:
        if 0 <= i < len(words):
            out.append(words[i].get("w", ""))
    return out


def _call_gpt(words: list[dict], language: str) -> list[int]:
    """Send transcript to GPT and parse the returned indices."""
    if not words:
        return []

    # Build a compact index:word transcript so the model can return indices.
    # Group long transcripts into one line per item with index prefix.
    items = [f"{i}:{w.get('w', '')}" for i, w in enumerate(words)]
    # Keep prompt small: join with spaces, but break every ~60 items for readability.
    lines = []
    for i in range(0, len(items), 60):
        lines.append(" ".join(items[i:i + 60]))
    transcript = "\n".join(lines)

    target = max(2, min(12, max(2, int(len(words) * 0.08))))

    lang_hint = ""
    if language and language != "auto":
        lang_hint = f" The spoken language is {language}."

    system = (
        "You are an editor for short-form video (Reels/TikTok). "
        "Given a transcript with words prefixed by their 0-based index "
        "(format 'index:word'), pick impactful words for on-screen highlights." + lang_hint +
        f" Pick about {target} words. "
        "Respond with ONLY comma-separated indices (single words or pairs as index-index). "
        "Prefer 1–2 consecutive words per highlight moment. "
        "Example: 3,12-13,27"
    )

    text = chat_text(
        get_keywords_model(), system, transcript,
        max_tokens=200,
        temperature=0.2,
        timeout=60,
    )

    return _parse_indices(text, len(words))


def _parse_indices(text: str, n_words: int) -> list[int]:
    """Parse '3-5,12-14,27' or '3,12,27' into a sorted deduped index list."""
    out: list[int] = []
    seen: set[int] = set()
    for tok in text.replace("\n", ",").split(","):
        tok = tok.strip()
        if not tok:
            continue
        if "-" in tok:
            parts = tok.split("-", 1)
            try:
                a, b = int(parts[0].strip()), int(parts[1].strip())
            except ValueError:
                continue
            lo, hi = min(a, b), max(a, b)
            for i in range(lo, hi + 1):
                if 0 <= i < n_words and i not in seen:
                    seen.add(i)
                    out.append(i)
        else:
            tok = tok.split(":")[0].strip()
            try:
                i = int(tok)
            except ValueError:
                continue
            if 0 <= i < n_words and i not in seen:
                seen.add(i)
                out.append(i)
    out.sort()
    return out
