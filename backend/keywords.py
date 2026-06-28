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

load_dotenv()

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("KEYWORDS_MODEL", "gpt-4o-mini")
# Approx. how many words to highlight. 15% feels punchy on short videos and
# not overwhelming on longer ones. Capped so very long transcripts don't get
# too busy.
MIN_KEYWORDS = 3
MAX_KEYWORDS = 40


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


def save_cache(job_dir: Path, indices: list[int], *, manual: bool, model: str = DEFAULT_MODEL) -> dict:
    payload = {
        "indices": indices,
        "manual": manual,
        "model": model,
        "ts": time.time(),
    }
    try:
        _cache_path(job_dir).write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        pass
    return payload


def detect_keywords(words: list[dict], job_dir: Path, language: str = "auto") -> dict:
    """Detect impactful words via GPT. Returns {indices, words_preview, manual, model}.

    Uses cache when available; otherwise calls the API.
    """
    cached = load_cached(job_dir)
    if cached and cached.get("indices"):
        return {
            "indices": cached["indices"],
            "words_preview": _preview(words, cached["indices"]),
            "manual": bool(cached.get("manual")),
            "model": cached.get("model", DEFAULT_MODEL),
        }
    indices = _call_gpt(words, language)
    save_cache(job_dir, indices, manual=False)
    return {
        "indices": indices,
        "words_preview": _preview(words, indices),
        "manual": False,
        "model": DEFAULT_MODEL,
    }


def save_manual(job_dir: Path, indices: list[int]) -> dict:
    """Persist the user's manually edited keyword selection."""
    save_cache(job_dir, indices, manual=True)
    return {"indices": indices, "manual": True}


def _preview(words: list[dict], indices: list[int]) -> list[str]:
    out = []
    for i in indices:
        if 0 <= i < len(words):
            out.append(words[i].get("w", ""))
    return out


def _call_gpt(words: list[dict], language: str) -> list[int]:
    """Send transcript to GPT-4o-mini and parse the returned indices."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada em backend/.env")
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

    target = max(MIN_KEYWORDS, min(MAX_KEYWORDS, int(len(words) * 0.15)))

    lang_hint = ""
    if language and language != "auto":
        lang_hint = f" The spoken language is {language}."

    system = (
        "You are an editor for short-form video (Reels/TikTok). "
        "Given a transcript with words prefixed by their 0-based index "
        "(format 'index:word'), pick the MOST impactful words to emphasize "
        "with a quick zoom effect." + lang_hint +
        f" Pick about {target} words (minimum {MIN_KEYWORDS}, maximum {MAX_KEYWORDS}). "
        "Prefer nouns, key verbs, numbers, and emotional/curiosity words. "
        "Avoid filler (the/a/de/um/e/que) and avoid words that are too common. "
        "Respond with ONLY the indices separated by commas, no text, no explanation. "
        "Example output: 3,12,27,45"
    )

    import requests
    resp = requests.post(
        OPENAI_CHAT_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": DEFAULT_MODEL,
            "temperature": 0.2,
            "max_tokens": 200,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": transcript},
            ],
        },
        timeout=60,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI chat error {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()

    return _parse_indices(text, len(words))


def _parse_indices(text: str, n_words: int) -> list[int]:
    """Parse '3, 12, 27' into a sorted, deduped, validated list of indices."""
    out: list[int] = []
    seen: set[int] = set()
    for tok in text.replace("\n", ",").split(","):
        tok = tok.strip()
        if not tok:
            continue
        # Tolerate tokens like "3:" or "3:" leftovers.
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
