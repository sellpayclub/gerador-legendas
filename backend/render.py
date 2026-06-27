"""FFmpeg render: burn ASS subtitles into the video.

Uses h264_videotoolbox on macOS when available; libx264 on Linux and as fallback.
Streams stderr to parse `time=HH:MM:SS` and emit progress relative to duration.
"""
from __future__ import annotations

import platform
import subprocess
from pathlib import Path
from typing import Callable, Optional

from media import ffmpeg_bin, parse_progress

FONTS_DIR = Path(__file__).resolve().parent / "fonts"


def _hw_encoder_available() -> bool:
    if platform.system() != "Darwin":
        return False
    out = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-encoders"],
        capture_output=True, text=True, check=True,
    )
    return "h264_videotoolbox" in out.stdout


def _escape_filter_path(path: str) -> str:
    """Escape a path for use inside an FFmpeg filtergraph value.

    Backslash-escape characters that have special meaning in the filtergraph
    syntax: backslash, single quote, colon, comma, semicolon, brackets.
    """
    out = []
    special = set("\\':,;[]")
    for ch in path:
        if ch in special:
            out.append("\\" + ch)
        else:
            out.append(ch)
    return "".join(out)


def _build_cmd(
    video: Path, ass: Path, out: Path, hw: bool,
) -> list[str]:
    # Use absolute path and escape it for the filtergraph
    ass_abs = ass.resolve().as_posix()
    ass_escaped = _escape_filter_path(ass_abs)
    if FONTS_DIR.is_dir():
        fonts_escaped = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        ass_filter = f"ass={ass_escaped}:fontsdir={fonts_escaped}"
    else:
        ass_filter = f"ass={ass_escaped}"
    if hw:
        return [
            ffmpeg_bin(), "-y", "-i", str(video),
            "-vf", ass_filter,
            "-c:v", "h264_videotoolbox", "-b:v", "8M",
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(out),
        ]
    return [
        ffmpeg_bin(), "-y", "-i", str(video),
        "-vf", ass_filter,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(out),
    ]


def render_video(
    video: Path,
    ass_path: Path,
    out_path: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]] = None,
) -> None:
    if not video.exists():
        raise FileNotFoundError(f"video missing: {video}")
    if not ass_path.exists():
        raise FileNotFoundError(f"ass missing: {ass_path}")
    if out_path.exists():
        out_path.unlink()

    hw = _hw_encoder_available()
    cmd = _build_cmd(video, ass_path, out_path, hw)
    if on_progress:
        on_progress(0.0, f"Renderizando ({'HW' if hw else 'CPU'})...")

    proc = subprocess.Popen(
        cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL,
        text=True, bufsize=1,
    )
    assert proc.stderr is not None
    try:
        for line in proc.stderr:
            p = parse_progress(line, duration)
            if p is not None and on_progress:
                on_progress(p, f"Renderizando... {int(p * 100)}%")
        rc = proc.wait()
        if rc != 0:
            raise RuntimeError(f"ffmpeg exited with {rc}")
        if on_progress:
            on_progress(1.0, "Render completo")
    finally:
        if proc.poll() is None:
            proc.kill()
