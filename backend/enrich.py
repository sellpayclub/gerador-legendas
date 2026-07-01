"""Post-transcription text enrichment: punctuation and contextual emojis."""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("ENRICH_MODEL", "gpt-4o-mini")
CHUNK_SIZE = 70

_EMOJI_RE = re.compile(
    r"^(\s*(?:[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E0-\U0001F1FF]"
    r"|[\U0001F900-\U0001F9FF])+)\s+(.+)$",
    re.UNICODE,
)

_FILLER = {
    "a", "o", "e", "de", "da", "do", "em", "um", "uma", "que", "pra", "para",
    "the", "an", "and", "or", "to", "of", "in", "é", "na", "no", "com", "por",
}


def _cache_path(job_dir: Path) -> Path:
    return job_dir / "enrich.json"


def load_cache(job_dir: Path) -> Optional[dict]:
    p = _cache_path(job_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_cache(job_dir: Path, payload: dict) -> None:
    try:
        payload["ts"] = time.time()
        _cache_path(job_dir).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def enrich_words(
    words: list[dict],
    job_dir: Path,
    language: str = "auto",
    *,
    punctuation: bool = True,
    emojis: bool = False,
) -> dict:
    if not words:
        return {"words": [], "changed": 0, "punctuation": punctuation, "emojis": emojis}

    updates: dict[int, str] = {}
    if punctuation:
        updates.update(_call_gpt_punctuation(words, language))
    if emojis:
        base = [dict(w) for w in words]
        for idx, text in updates.items():
            if 0 <= idx < len(base):
                base[idx]["w"] = text
        updates.update(_call_gpt_emojis(base, language))

    new_words = [dict(w) for w in words]
    changed = 0
    for idx, text in updates.items():
        if 0 <= idx < len(new_words) and text and text != new_words[idx].get("w", ""):
            new_words[idx]["w"] = text
            changed += 1

    result = {
        "words": new_words,
        "changed": changed,
        "punctuation": punctuation,
        "emojis": emojis,
        "model": DEFAULT_MODEL,
    }
    save_cache(job_dir, {"updates": {str(k): v for k, v in updates.items()}, **result})
    return result


def apply_punctuation_auto(words: list[dict], job_dir: Path, language: str = "auto") -> list[dict]:
    try:
        r = enrich_words(words, job_dir, language, punctuation=True, emojis=False)
        return r["words"]
    except Exception:
        return words


def _chunk_ranges(n: int, size: int = CHUNK_SIZE) -> list[tuple[int, int]]:
    return [(i, min(i + size, n)) for i in range(0, n, size)]


def _transcript_chunk(words: list[dict], start: int, end: int) -> str:
    return " ".join(f"{i}:{words[i].get('w', '')}" for i in range(start, end))


def _context_block(words: list[dict], idx: int, radius: int = 5) -> str:
    lo = max(0, idx - radius)
    hi = min(len(words), idx + radius + 1)
    return " ".join(f"{j}:{words[j].get('w', '')}" for j in range(lo, hi))


def _openai_json(system: str, user: str, *, max_tokens: int = 1500) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada em backend/.env")

    import requests
    resp = requests.post(
        OPENAI_CHAT_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": DEFAULT_MODEL,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI chat error {resp.status_code}: {resp.text[:400]}")

    raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content") or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _parse_updates(data: dict, n_words: int) -> dict[int, str]:
    updates_raw = data.get("updates") or data.get("changes") or {}
    out: dict[int, str] = {}
    for k, v in updates_raw.items():
        try:
            idx = int(str(k).split(":")[0])
        except ValueError:
            continue
        text = str(v).strip()
        if text and 0 <= idx < n_words:
            out[idx] = text
    return out


_TRAIL_PUNCT_RE = re.compile(r"([,.!?…:;—]+|\.\.\.)$")
_WORD_CORE_RE = re.compile(r"[^\w]", flags=re.UNICODE)


def _word_core(text: str) -> str:
    return _WORD_CORE_RE.sub("", (text or "").strip().lower())


def _chunk_tokens(words: list[dict], start: int, end: int) -> list[str]:
    return [(words[i].get("w") or "").strip() for i in range(start, end)]


def _merge_word_punctuation(original: str, aligned: str) -> str:
    """Keep original spelling/casing/emojis; take trailing punctuation from GPT."""
    orig = (original or "").strip()
    al = (aligned or "").strip()
    if not orig:
        return al
    if not al:
        return orig
    trail_m = _TRAIL_PUNCT_RE.search(al)
    trail = trail_m.group(1) if trail_m else ""
    base = _TRAIL_PUNCT_RE.sub("", orig).rstrip()
    if not trail:
        return orig
    if _TRAIL_PUNCT_RE.search(orig):
        base = _TRAIL_PUNCT_RE.sub("", base).rstrip()
    return f"{base}{trail}"


def _align_punctuated_tokens(original: list[str], punctuated_text: str) -> list[str]:
    """Map GPT punctuated prose back onto the original word tokens."""
    ptoks = re.findall(r"\S+", (punctuated_text or "").strip())
    if not ptoks:
        return original[:]

    out: list[str] = []
    j = 0
    for ow in original:
        ow = (ow or "").strip()
        core = _word_core(ow)
        if not core:
            out.append(ow)
            continue
        matched: str | None = None
        while j < len(ptoks):
            pt = ptoks[j]
            j += 1
            pcore = _word_core(pt)
            if not pcore:
                continue
            if pcore == core or core in pcore or pcore in core:
                matched = pt
                break
        out.append(_merge_word_punctuation(ow, matched or ow))
    return out


def _call_gpt_punctuation(words: list[dict], language: str) -> dict[int, str]:
    lang_hint = ""
    if language and language != "auto":
        lang_hint = f" The spoken language is {language}."
    else:
        lang_hint = " Detect the language from the transcript."

    system = (
        "You add natural punctuation to short-form video captions." + lang_hint +
        "\n\nInput: a space-separated transcript from speech recognition (no punctuation).\n"
        "Output JSON: {\"text\": \"same words in the same order with punctuation attached\"}.\n\n"
        "Rules:\n"
        "- Do NOT add, remove, or reorder words.\n"
        "- Attach commas, periods, question marks, exclamation marks, colons, "
        "semicolons and … to the correct words.\n"
        "- Do not change spelling or capitalization of the words themselves.\n"
        "- Keep emojis and symbols that are already part of a token."
    )

    out: dict[int, str] = {}
    n = len(words)
    for start, end in _chunk_ranges(n):
        tokens = _chunk_tokens(words, start, end)
        if not tokens:
            continue
        plain = " ".join(t for t in tokens if t)
        if not plain.strip():
            continue
        data = _openai_json(system, plain, max_tokens=2200)
        text = (data.get("text") or data.get("transcript") or "").strip()
        if not text:
            continue
        aligned = _align_punctuated_tokens(tokens, text)
        for i, new_text in enumerate(aligned):
            if i >= len(tokens):
                break
            merged = _merge_word_punctuation(tokens[i], new_text)
            if merged and merged != tokens[i]:
                out[start + i] = merged
    return out


def _emoji_candidates(words: list[dict], start: int, end: int) -> list[int]:
    out: list[int] = []
    for i in range(start, end):
        raw = (words[i].get("w") or "").strip()
        if not raw or _EMOJI_RE.match(raw):
            continue
        if raw.lower().strip(".,!?…:;—") in _FILLER:
            continue
        out.append(i)
    return out


def _call_gpt_emojis(words: list[dict], language: str) -> dict[int, str]:
    n = len(words)
    if n == 0:
        return {}

    max_total = max(4, min(24, int(n * 0.12)))
    per_chunk = max(2, min(5, max_total // max(1, (n + CHUNK_SIZE - 1) // CHUNK_SIZE)))

    lang_hint = ""
    if language and language != "auto":
        lang_hint = f" The spoken language is {language}."

    system = (
        "You pick emojis for short-form video captions (Reels/TikTok)." + lang_hint +
        "\n\nSTRICT RULES:\n"
        "1. Each emoji MUST directly relate to the MEANING of the focus word in context.\n"
        "2. Read the full context line — never pick a random/trending emoji.\n"
        "3. Do NOT use 🔥 unless the word is literally about fire, heat, or something 'on fire'.\n"
        "4. If no emoji clearly fits, SKIP that index.\n"
        "5. Format: one emoji + space + original word (keep punctuation if any).\n"
        f"6. Pick at most {per_chunk} words in THIS chunk.\n\n"
        'Respond ONLY JSON: {"updates": {"12": "💰 dinheiro", "45": "❤️ amor"}}'
    )

    merged: dict[int, str] = {}
    for start, end in _chunk_ranges(n):
        cands = _emoji_candidates(words, start, end)
        if not cands:
            continue
        lines = [
            f"index {i} | focus: «{(words[i].get('w') or '').strip()}» | ctx: {_context_block(words, i)}"
            for i in cands[:35]
        ]
        data = _openai_json(system, "Candidates:\n\n" + "\n".join(lines), max_tokens=900)
        chunk = _parse_updates(data, n)
        for idx, text in chunk.items():
            if start <= idx < end:
                merged[idx] = text

    return _validate_emoji_updates(words, merged)


def _validate_emoji_updates(words: list[dict], updates: dict[int, str]) -> dict[int, str]:
    out: dict[int, str] = {}
    for idx, text in updates.items():
        if not (0 <= idx < len(words)):
            continue
        text = text.strip()
        m = _EMOJI_RE.match(text)
        if not m:
            continue
        original = (words[idx].get("w") or "").strip()
        word_part = m.group(2).strip()
        if original:
            orig_core = re.sub(r"[^\w]", "", original.lower(), flags=re.UNICODE)
            new_core = re.sub(r"[^\w]", "", word_part.lower(), flags=re.UNICODE)
            if orig_core and new_core and orig_core not in new_core and new_core not in orig_core:
                continue
        out[idx] = text
    return out
