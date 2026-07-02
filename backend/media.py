"""FFmpeg/FFprobe helpers.

Prefers `ffmpeg-full` (Homebrew keg-only) which includes libass, required to
burn ASS subtitles. Falls back to the regular `ffmpeg` if not present.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

# Homebrew installs ffmpeg-full as keg-only at this path
FFMPEG_FULL_CANDIDATES = [
    "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
    "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
]
FFPROBE_FULL_CANDIDATES = [
    "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe",
    "/usr/local/opt/ffmpeg-full/bin/ffprobe",
]


def _resolve_bin(name: str, full_candidates: list[str]) -> str:
    for c in full_candidates:
        if Path(c).exists():
            return c
    found = shutil.which(name)
    if found:
        return found
    raise RuntimeError(
        f"{name} not found. Install with: brew install ffmpeg-full"
    )


def ffmpeg_bin() -> str:
    return _resolve_bin("ffmpeg", FFMPEG_FULL_CANDIDATES)


def ffprobe_bin() -> str:
    return _resolve_bin("ffprobe", FFPROBE_FULL_CANDIDATES)


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None and not any(Path(c).exists() for c in FFMPEG_FULL_CANDIDATES):
        raise RuntimeError(
            "ffmpeg not found. Install with: brew install ffmpeg-full"
        )
    # Confirm libass support
    out = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-filters"],
        capture_output=True, text=True,
    )
    if " ass " not in out.stdout:
        raise RuntimeError(
            "ffmpeg build lacks libass support (no 'ass' filter). "
            "Install: brew install ffmpeg-full"
        )


def ffmpeg_ok() -> bool:
    try:
        ensure_ffmpeg()
        return True
    except RuntimeError:
        return False


def probe_video(path: Path) -> dict:
    out = subprocess.run(
        [
            ffprobe_bin(), "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
        ],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(out.stdout)
    streams = data.get("streams", [])
    vs = next((s for s in streams if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    fmt = data.get("format", {})
    fps = 30.0
    if vs.get("r_frame_rate"):
        num, den = vs["r_frame_rate"].split("/")
        try:
            fps = float(num) / float(den) if float(den) else 30.0
        except ValueError:
            pass
    w = int(vs.get("width", 1920))
    h = int(vs.get("height", 1080))
    # Phone videos often store landscape WxH with a rotation tag — swap so
    # PlayRes matches what the player (and libass) actually displays.
    rotate = 0
    tags = vs.get("tags") or {}
    if tags.get("rotate"):
        try:
            rotate = int(tags["rotate"])
        except ValueError:
            pass
    for sd in vs.get("side_data_list") or []:
        if sd.get("side_data_type") == "Display Matrix":
            rot = sd.get("rotation")
            if rot is not None:
                rotate = int(round(float(rot)))
    if abs(rotate) in (90, 270):
        w, h = h, w

    return {
        "width": w,
        "height": h,
        "fps": fps,
        "duration": float(fmt.get("duration", 0.0) or 0.0),
        "has_audio": has_audio,
    }


def extract_audio(video: Path, out_path: Path) -> None:
    """Extract mono speech audio optimized for Whisper (MP3 — stays under OpenAI 25MB)."""
    suffix = out_path.suffix.lower()
    if suffix in (".mp3", ".mpeg", ".mpga"):
        cmd = [
            ffmpeg_bin(), "-y", "-i", str(video),
            "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "libmp3lame", "-b:a", "48k",
            str(out_path),
        ]
    else:
        cmd = [
            ffmpeg_bin(), "-y", "-i", str(video),
            "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le",
            str(out_path),
        ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg extract audio failed: {proc.stderr[-600:]}")


def audio_duration(path: Path) -> float:
    return probe_video(path).get("duration", 0.0) or 0.0


def split_audio_chunks(
    audio: Path,
    out_dir: Path,
    *,
    chunk_seconds: float = 600.0,
) -> list[tuple[Path, float]]:
    """Split audio into segments; returns [(path, start_offset_s), ...]."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "chunk_%03d.mp3"
    for old in out_dir.glob("chunk_*.mp3"):
        old.unlink(missing_ok=True)
    proc = subprocess.run(
        [
            ffmpeg_bin(), "-y", "-i", str(audio),
            "-f", "segment", "-segment_time", f"{chunk_seconds:.3f}",
            "-c:a", "libmp3lame", "-b:a", "48k", "-ar", "16000", "-ac", "1",
            str(pattern),
        ],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg split audio failed: {proc.stderr[-600:]}")
    chunks = sorted(out_dir.glob("chunk_*.mp3"))
    if not chunks:
        return [(audio, 0.0)]
    out: list[tuple[Path, float]] = []
    offset = 0.0
    for ch in chunks:
        out.append((ch, offset))
        offset += audio_duration(ch) or chunk_seconds
    return out


def parse_progress(line: str, total_duration: float) -> float | None:
    """Parse an FFmpeg stderr line and return progress fraction in [0,1]."""
    if not line or total_duration <= 0:
        return None
    if "time=" not in line:
        return None
    t = line.split("time=", 1)[1].split(" ", 1)[0].strip()
    try:
        h, m, s = t.split(":")
        secs = int(h) * 3600 + int(m) * 60 + float(s)
        return max(0.0, min(1.0, secs / total_duration))
    except (ValueError, IndexError):
        return None
