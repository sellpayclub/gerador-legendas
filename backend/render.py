"""FFmpeg render: burn ASS subtitles into the video."""
from __future__ import annotations

import platform
import subprocess
from pathlib import Path
from typing import Callable, Optional

from media import ffmpeg_bin, parse_progress, escape_filter_path as _escape_filter_path

import effects as fx

FONTS_DIR = Path(__file__).resolve().parent / "fonts"


def _hw_encoder_available() -> bool:
    if platform.system() != "Darwin":
        return False
    out = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-encoders"],
        capture_output=True, text=True, check=True, timeout=30,
    )
    return "h264_videotoolbox" in out.stdout


def _ass_filter(ass_path: Path) -> str:
    ass_escaped = _escape_filter_path(ass_path.resolve().as_posix())
    if FONTS_DIR.is_dir():
        fonts_escaped = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        return f"ass={ass_escaped}:fontsdir={fonts_escaped}"
    return f"ass={ass_escaped}"


def _build_video_chain(
    in_label: str,
    out_label: str,
    ass_path: Path,
    highlight_phrases: list[dict] | None,
    extras: 'ComposeExtras' | None,
    duration: float,
    canvas_w: int,
    canvas_h: int,
) -> str:
    current = in_label
    parts: list[str] = []

    # ass burn
    parts.append(f"[{current}]{_ass_filter(ass_path)}[vass]")
    current = "vass"

    # progress bar fake
    if extras and extras.progress_enabled:
        from compose import _progress_overlay_chain
        from overlays import clamp_progress_height_pct
        pb_info = _progress_overlay_chain(extras, duration, canvas_w, canvas_h)
        if pb_info:
            pb_chain, x_expr = pb_info
            parts.append(pb_chain)
            h_pct = clamp_progress_height_pct(extras.progress_height_pct)
            bar_h = max(1, round(canvas_h * h_pct))
            parts.append(f"[{current}][pbar]overlay=x='{x_expr}':y={canvas_h - bar_h}[{out_label}]")
        else:
            parts.append(f"[{current}]copy[{out_label}]")
    else:
        parts.append(f"[{current}]copy[{out_label}]")

    return ";".join(parts)


def _build_cmd(
    video: Path,
    ass: Path,
    out: Path,
    hw: bool,
    duration: float,
    canvas_w: int,
    canvas_h: int,
    highlight_phrases: list[dict] | None = None,
    extras: 'ComposeExtras' | None = None,
) -> list[str]:
    use_complex = bool(extras and extras.progress_enabled)

    cmd: list[str] = [ffmpeg_bin(), "-y", "-i", str(video)]

    if use_complex:
        vchain = _build_video_chain("0:v", "vout", ass, highlight_phrases, extras, duration, canvas_w, canvas_h)
        cmd += ["-filter_complex", vchain, "-map", "[vout]", "-map", "0:a?"]
    else:
        cmd += ["-vf", _ass_filter(ass), "-map", "0:v", "-map", "0:a?"]

    if hw:
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", "8M"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]

    cmd += ["-c:a", "copy", "-movflags", "+faststart", str(out)]
    return cmd


def render_video(
    video: Path,
    ass_path: Path,
    out_path: Path,
    duration: float,
    on_progress: Optional[Callable[[float, str], None]] = None,
    highlight_phrases: list[dict] | None = None,
    extras: 'ComposeExtras' | None = None,
    canvas_w: int = 1080,
    canvas_h: int = 1920,
) -> None:
    if not video.exists():
        raise FileNotFoundError(f"video missing: {video}")
    if not ass_path.exists():
        raise FileNotFoundError(f"ass missing: {ass_path}")
    if out_path.exists():
        out_path.unlink()

    hw = _hw_encoder_available()
    cmd = _build_cmd(video, ass_path, out_path, hw, duration, canvas_w, canvas_h, highlight_phrases, extras)
    if on_progress:
        on_progress(0.0, f"Renderizando ({'HW' if hw else 'CPU'})...")

    proc = subprocess.Popen(
        cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL,
        text=True, bufsize=1,
    )
    assert proc.stderr is not None
    stderr_tail: list[str] = []
    try:
        for line in proc.stderr:
            stderr_tail.append(line)
            if len(stderr_tail) > 40:
                stderr_tail.pop(0)
            p = parse_progress(line, duration)
            if p is not None and on_progress:
                on_progress(p, f"Renderizando... {int(p * 100)}%")
        rc = proc.wait()
        if rc != 0:
            tail = "".join(stderr_tail)[-800:]
            raise RuntimeError(f"ffmpeg exited with {rc}: {tail}")
        if on_progress:
            on_progress(1.0, "Render completo")
    finally:
        if proc.poll() is None:
            proc.kill()
