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

load_dotenv()

ENGINE = os.environ.get("TRANSCRIBE_ENGINE", "").strip().lower()
if not ENGINE:
    ENGINE = "openai" if os.environ.get("OPENAI_API_KEY") else "mlx"

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "whisper-1")
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
    if ENGINE == "openai":
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

OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions"


def _transcribe_openai(
    audio_wav: Path,
    out_json: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]],
    language: Optional[str],
    dims: Optional[dict] = None,
) -> dict:
    import requests

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY não configurada. Adicione em backend/.env"
        )

    if on_progress:
        on_progress(0.1, "Enviando áudio para OpenAI...")

    # When no language is given, omit the param so Whisper auto-detects
    # (works for PT / EN / ES / etc).
    lang = language or os.environ.get("WHISPER_LANGUAGE") or None

    # OpenAI expects repeated `timestamp_granularities[]` keys (not [0]/[1]).
    form_data: list[tuple[str, str]] = [
        ("model", OPENAI_MODEL),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "word"),
    ]
    if lang:
        form_data.append(("language", lang))

    with open(audio_wav, "rb") as fh:
        files = {"file": (audio_wav.name, fh, "audio/wav")}
        headers = {"Authorization": f"Bearer {api_key}"}
        resp = requests.post(
            OPENAI_URL, headers=headers, files=files, data=form_data, timeout=600
        )
        if resp.status_code != 200:
            raise RuntimeError(f"OpenAI API error {resp.status_code}: {resp.text[:500]}")
        data = resp.json()

    if on_progress:
        on_progress(0.9, "Processando palavras...")

    words = _extract_openai_words(data)
    payload = _payload_with_dims({
        "duration": duration or float(data.get("duration", 0.0) or 0.0),
        "words": words,
    }, dims or {})
    out_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if on_progress:
        on_progress(1.0, f"{len(words)} palavras transcritas (OpenAI)")
    return payload


def _extract_openai_words(data: dict) -> list[dict]:
    out: list[dict] = []
    for w in data.get("words", []):
        text = (w.get("word") or w.get("text") or "").strip()
        if not text:
            continue
        start = float(w.get("start", 0.0))
        end = float(w.get("end", start))
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
