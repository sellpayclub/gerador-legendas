"""FFmpeg render: burn ASS subtitles into the video."""
from __future__ import annotations

import platform
import subprocess
from pathlib import Path
from typing import Callable, Optional

from media import ffmpeg_bin, parse_progress

import effects as fx

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
    out = []
    special = set("\\':,;[]")
    for ch in path:
        if ch in special:
            out.append("\\" + ch)
        else:
            out.append(ch)
    return "".join(out)


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
) -> str:
    current = in_label
    parts: list[str] = []

    if highlight_phrases:
        blur_expr = fx.blur_enable_expr(highlight_phrases)
        if blur_expr:
            parts.append(
                f"[{current}]gblur=sigma=28:enable='{blur_expr}',"
                f"eq=brightness=-0.14:saturation=0.75:enable='{blur_expr}'[vblur]"
            )
            current = "vblur"

    parts.append(f"[{current}]{_ass_filter(ass_path)}[{out_label}]")
    return ";".join(parts)


def _build_cmd(
    video: Path,
    ass: Path,
    out: Path,
    hw: bool,
    highlight_phrases: list[dict] | None = None,
) -> list[str]:
    phrases = highlight_phrases or []
    blur_expr = fx.blur_enable_expr(phrases) if phrases else ""
    use_complex = bool(blur_expr)

    cmd: list[str] = [ffmpeg_bin(), "-y", "-i", str(video)]

    if use_complex:
        vchain = _build_video_chain("0:v", "vout", ass, phrases)
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
    highlight_effects: dict | None = None,
) -> None:
    del highlight_effects  # legacy param — ignored
    if not video.exists():
        raise FileNotFoundError(f"video missing: {video}")
    if not ass_path.exists():
        raise FileNotFoundError(f"ass missing: {ass_path}")
    if out_path.exists():
        out_path.unlink()

    hw = _hw_encoder_available()
    cmd = _build_cmd(video, ass_path, out_path, hw, highlight_phrases)
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
