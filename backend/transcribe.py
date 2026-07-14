"""Transcription with word-level timestamps.

Two engines:
- "openai": calls OpenAI's Whisper API (whisper-1) directly via HTTP/requests
  with `timestamp_granularities[]=word` and `response_format=verbose_json`.
  Fast, reliable, no local model download. Requires OPENAI_API_KEY.
- "mlx": uses mlx-whisper locally on Apple Silicon.

Selected via env TRANSCRIBE_ENGINE (default "openai" if OPENAI_API_KEY is set).
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from dotenv import load_dotenv

from app_settings import (
    get_openai_api_key,
    get_openai_model,
    get_openai_transcribe_url,
    get_transcribe_engine,
)

load_dotenv()

MLX_MODEL = os.environ.get(
    "WHISPER_MODEL", "mlx-community/whisper-medium-mlx-4bit"
)

RT_FACTOR = 10.0  # mlx only


def transcribe(
    audio_wav: Path,
    out_json: Path,
    duration: float = 0.0,
    on_progress: Optional[Callable[[float, str], None]] = None,
    language: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    fps: Optional[float] = None,
) -> dict:
    """Transcribe audio and write words.json. Returns the parsed dict."""
    dims = {"width": width, "height": height, "fps": fps}
    engine = get_transcribe_engine()
    if engine == "openai":
        return _transcribe_openai(audio_wav, out_json, duration, on_progress, language, dims)
    return _transcribe_mlx(audio_wav, out_json, duration, on_progress, language, MLX_MODEL, dims)


def _payload_with_dims(payload: dict, dims: dict) -> dict:
    """Attach video dims to the words payload when known (keeps words.json
    self-describing so the ASS generator never falls back to a wrong default)."""
    for key in ("width", "height", "fps"):
        if dims.get(key) is not None:
            payload[key] = dims[key]
    return payload


# ---------- OpenAI (direct HTTP, no SDK) ----------

# OpenAI Whisper API hard limit is 25 MB; stay under with margin.
OPENAI_MAX_BYTES = int(os.environ.get("OPENAI_MAX_AUDIO_BYTES", str(24 * 1024 * 1024)))


def _positive_env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except (TypeError, ValueError):
        return default


_TRANSCRIBE_SLOTS = threading.BoundedSemaphore(
    _positive_env_int("MAX_CONCURRENT_TRANSCRIPTIONS", 3)
)


def _chunk_cache_path(chunk_path: Path) -> Path:
    return chunk_path.with_suffix(chunk_path.suffix + ".transcript.json")


def _load_chunk_cache(chunk_path: Path, language: Optional[str]) -> list[dict] | None:
    cache_path = _chunk_cache_path(chunk_path)
    if not cache_path.exists():
        return None
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached.get("audio_bytes") != chunk_path.stat().st_size:
            return None
        if cached.get("language") != (language or ""):
            return None
        if cached.get("model") != get_openai_model():
            return None
        words = cached.get("words")
        return words if isinstance(words, list) else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def _save_chunk_cache(
    chunk_path: Path,
    language: Optional[str],
    words: list[dict],
) -> None:
    cache_path = _chunk_cache_path(chunk_path)
    temp_path = cache_path.with_suffix(cache_path.suffix + ".tmp")
    payload = {
        "audio_bytes": chunk_path.stat().st_size,
        "language": language or "",
        "model": get_openai_model(),
        "words": words,
    }
    temp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temp_path.replace(cache_path)


def _transcribe_openai(
    audio_wav: Path,
    out_json: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]],
    language: Optional[str],
    dims: Optional[dict] = None,
) -> dict:
    size = audio_wav.stat().st_size if audio_wav.exists() else 0
    if size > OPENAI_MAX_BYTES:
        return _transcribe_openai_chunked(
            audio_wav, out_json, duration, on_progress, language, dims,
        )
    return _transcribe_openai_single(
        audio_wav, out_json, duration, on_progress, language, dims, time_offset=0.0,
    )


def _transcribe_openai_chunked(
    audio_path: Path,
    out_json: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]],
    language: Optional[str],
    dims: Optional[dict] = None,
) -> dict:
    from media import split_audio_chunks

    chunk_dir = audio_path.parent / "audio_chunks"
    # ~10 min chunks at 48k mp3 ≈ 3.6 MB each — safe under 25 MB
    chunks = split_audio_chunks(audio_path, chunk_dir, chunk_seconds=600.0)
    all_words: list[dict] = []
    n = len(chunks)

    import concurrent.futures

    def _process_chunk(args: tuple[int, tuple[Path, float]]) -> list[dict]:
        _i, (chunk_path, offset) = args
        cached = _load_chunk_cache(chunk_path, language)
        if cached is not None:
            return [
                {
                    **word,
                    "start": round(float(word["start"]) + offset, 3),
                    "end": round(float(word["end"]) + offset, 3),
                }
                for word in cached
            ]
        data = _call_openai_transcribe(chunk_path, language)
        relative_words = _extract_openai_words(data)
        _save_chunk_cache(chunk_path, language, relative_words)
        return [
            {
                **word,
                "start": round(float(word["start"]) + offset, 3),
                "end": round(float(word["end"]) + offset, 3),
            }
            for word in relative_words
        ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for completed, words in enumerate(
            executor.map(_process_chunk, enumerate(chunks)), start=1
        ):
            all_words.extend(words)
            if on_progress:
                on_progress(
                    completed / max(n, 1),
                    f"Parte {completed}/{n} transcrita...",
                )

    payload = _payload_with_dims({
        "duration": duration or (all_words[-1]["end"] if all_words else 0.0),
        "words": all_words,
    }, dims or {})
    out_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if on_progress:
        on_progress(1.0, f"{len(all_words)} palavras transcritas (OpenAI, {n} partes)")
    return payload


def _transcribe_openai_single(
    audio_path: Path,
    out_json: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]],
    language: Optional[str],
    dims: Optional[dict] = None,
    *,
    time_offset: float = 0.0,
) -> dict:
    if on_progress:
        on_progress(0.1, "Enviando áudio para OpenAI...")

    stop = threading.Event()
    if on_progress:
        est_total = max(8.0, (duration or 0.0) / 12.0)
        t0 = time.time()

        def _crawl() -> None:
            while not stop.wait(0.7):
                elapsed = time.time() - t0
                pct = 0.1 + min(0.75, (elapsed / est_total) * 0.75)
                try:
                    on_progress(pct, f"Transcrevendo com OpenAI... {int(pct * 100)}%")
                except Exception:
                    pass

        threading.Thread(target=_crawl, daemon=True).start()

    try:
        data = _call_openai_transcribe(audio_path, language)
    finally:
        stop.set()

    if on_progress:
        on_progress(0.9, "Processando palavras...")

    words = _extract_openai_words(data, time_offset=time_offset)
    payload = _payload_with_dims({
        "duration": duration or float(data.get("duration", 0.0) or 0.0),
        "words": words,
    }, dims or {})
    out_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if on_progress:
        on_progress(1.0, f"{len(words)} palavras transcritas (OpenAI)")
    return payload


def _call_openai_transcribe(audio_path: Path, language: Optional[str]) -> dict:
    import requests

    api_key = get_openai_api_key()
    openai_model = get_openai_model()

    lang = language or os.environ.get("WHISPER_LANGUAGE") or None
    form_data: list[tuple[str, str]] = [
        ("model", openai_model),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "word"),
    ]
    if lang:
        form_data.append(("language", lang))

    mime = "audio/mpeg" if audio_path.suffix.lower() == ".mp3" else "audio/wav"
    headers = {"Authorization": f"Bearer {api_key}"}
    attempts = max(1, int(os.environ.get("OPENAI_TRANSCRIBE_ATTEMPTS", "3")))
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            # Reopen the stream on every attempt; requests consumes it.
            with _TRANSCRIBE_SLOTS:
                with open(audio_path, "rb") as fh:
                    files = {"file": (audio_path.name, fh, mime)}
                    resp = requests.post(
                        get_openai_transcribe_url(),
                        headers=headers,
                        files=files,
                        data=form_data,
                        timeout=600,
                    )
            if resp.status_code == 200:
                return resp.json()
            error = RuntimeError(
                f"OpenAI API error {resp.status_code}: {resp.text[:500]}"
            )
            # Authentication, malformed input and other permanent errors should
            # be shown immediately rather than retried for several minutes.
            if resp.status_code != 429 and resp.status_code < 500:
                raise error
            last_error = error
            retry_after = resp.headers.get("Retry-After", "")
            try:
                delay = float(retry_after)
            except (TypeError, ValueError):
                delay = min(8.0, 2.0 ** attempt)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            last_error = exc
            delay = min(8.0, 2.0 ** attempt)

        if attempt + 1 < attempts:
            time.sleep(max(0.0, min(delay, 30.0)))

    raise RuntimeError(f"Falha temporária ao transcrever após {attempts} tentativas: {last_error}")


def _extract_openai_words(data: dict, *, time_offset: float = 0.0) -> list[dict]:
    out: list[dict] = []
    for w in data.get("words", []):
        text = (w.get("word") or w.get("text") or "").strip()
        if not text:
            continue
        raw_start = float(w.get("start", 0.0))
        raw_end = float(w.get("end", raw_start))
        start = raw_start + time_offset
        end = raw_end + time_offset
        if end <= start:
            end = start + 0.08
        out.append({"w": text, "start": round(start, 3), "end": round(end, 3)})
    return out


# ---------- mlx-whisper (local) ----------

def _transcribe_mlx(
    audio_wav: Path,
    out_json: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]],
    language: Optional[str],
    model: str,
    dims: Optional[dict] = None,
) -> dict:
    import mlx_whisper

    stop = threading.Event()
    if on_progress and duration > 0:
        est_total = max(5.0, duration / RT_FACTOR)
        t0 = time.time()

        def _poll() -> None:
            while not stop.wait(0.5):
                elapsed = time.time() - t0
                pct = min(0.95, elapsed / est_total)
                try:
                    on_progress(pct, f"Transcrevendo... {int(pct * 100)}%")
                except Exception:
                    pass

        threading.Thread(target=_poll, daemon=True).start()

    try:
        if on_progress:
            on_progress(0.0, f"Carregando modelo {model.split('/')[-1]}")
        result = mlx_whisper.transcribe(
            str(audio_wav),
            path_or_hf_repo=model,
            word_timestamps=True,
            language=language,
            verbose=False,
        )
    finally:
        stop.set()

    words = _extract_mlx_words(result)
    if on_progress:
        on_progress(0.99, "Salvando palavras")

    payload = _payload_with_dims({
        "duration": duration or _last_segment_end(result),
        "words": words,
    }, dims or {})
    out_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if on_progress:
        on_progress(1.0, f"{len(words)} palavras transcritas")
    return payload


def _extract_mlx_words(result: dict) -> list[dict]:
    out: list[dict] = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            token = w.get("word", "").strip()
            if not token:
                continue
            start = float(w.get("start", 0.0))
            end = float(w.get("end", start))
            if end <= start:
                end = start + 0.08
            out.append({"w": token, "start": round(start, 3), "end": round(end, 3)})
    return out


def _last_segment_end(result: dict) -> float:
    segs = result.get("segments", [])
    if not segs:
        return 0.0
    return float(segs[-1].get("end", 0.0))
