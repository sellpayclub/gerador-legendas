"""FFmpeg composition: templates + highlight blur + ASS subtitles.

Builds a multi-input filtergraph that:
  1. scales+crops the original video into the template's video_region
  2. scales+crops the user-uploaded overlay into the overlay_region
  3. stacks the two regions into the template canvas (vstack for top/bottom)
  4. blurs the canvas during highlight phrase windows (gblur enable)
  5. burns the ASS subtitles (including centered HighlightHero phrases)
  6. scales to the final output resolution

The original video's audio is preserved (-map 0:a). Overlay audio (if any) is
discarded so the user's voice stays as the only audio track.
"""
from __future__ import annotations

import platform
import subprocess
from pathlib import Path
from typing import Callable, Optional

from media import ffmpeg_bin, parse_progress
from templates import TemplateDef, resolution_dims

import effects as fx

FONTS_DIR = Path(__file__).resolve().parent / "fonts"

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


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


def _is_image(p: Path) -> bool:
    return p.suffix.lower() in _IMAGE_EXTS


def _blur_enable_expr(phrases: list[dict]) -> str:
    return fx.blur_enable_expr(phrases)


def _build_cmd(
    video: Path,
    overlay: Optional[Path],
    ass_path: Path,
    out_path: Path,
    tpl: TemplateDef,
    highlight_phrases: list[dict],
    out_w: int,
    out_h: int,
    fps: float,
    duration: float,
    hw: bool,
    video_pos: tuple[Optional[float], Optional[float]] = (None, None),
    highlight_effects: dict | None = None,
) -> list[str]:
    cmd: list[str] = [ffmpeg_bin(), "-y"]
    cmd += ["-i", str(video)]

    if overlay is not None:
        if _is_image(overlay):
            cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(overlay)]
        else:
            cmd += ["-stream_loop", "-1", "-i", str(overlay)]

    vr = tpl.video_region
    orr = tpl.overlay_region

    # Original video -> video_region (cover: scale to fill then crop).
    # video_pos (0..1, 0.5=center) controls the crop offset so the user can
    # choose which part of the video stays visible after cropping to the
    # template's vertical/square region.
    vpx, vpy = video_pos
    vpx = 0.5 if vpx is None else max(0.0, min(1.0, float(vpx)))
    vpy = 0.5 if vpy is None else max(0.0, min(1.0, float(vpy)))
    # crop=W:H:x='(iw-W)*px':y='(ih-H)*py'
    fg = (
        f"[0:v]scale={vr.w}:{vr.h}:force_original_aspect_ratio=increase,"
        f"crop={vr.w}:{vr.h}:x='(iw-{vr.w})*{vpx:.3f}':y='(ih-{vr.h})*{vpy:.3f}',"
        f"setsar=1,fps={fps}[vsrc_raw]"
    )

    vsrc_label = "vsrc_raw"

    if overlay is not None:
        fg += (
            f";[1:v]scale={orr.w}:{orr.h}:force_original_aspect_ratio=increase,"
            f"crop={orr.w}:{orr.h},setsar=1,fps={fps}[ovr]"
        )
        fg += f";[ovr][{vsrc_label}]vstack=inputs=2[stacked]"
    else:
        fg += (
            f";[{vsrc_label}]pad={tpl.width}:{tpl.height}:{orr.x}:{orr.y}:black[stacked]"
        )

    blur_expr = fx.blur_enable_expr(highlight_phrases) if highlight_phrases else ""
    if blur_expr:
        fg += (
            f";[stacked]gblur=sigma=28:enable='{blur_expr}',"
            f"eq=brightness=-0.14:saturation=0.75:enable='{blur_expr}'[blurred]"
        )
        stacked_label = "blurred"
    else:
        stacked_label = "stacked"

    fg += f";[{stacked_label}]scale={tpl.width}:{tpl.height}:flags=lanczos[scaled]"

    # ASS subtitles
    ass_esc = _escape_filter_path(ass_path.resolve().as_posix())
    if FONTS_DIR.is_dir():
        fonts_esc = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        fg += f";[scaled]ass={ass_esc}:fontsdir={fonts_esc}[subbed]"
    else:
        fg += f";[scaled]ass={ass_esc}[subbed]"

    # Final scale to chosen resolution
    fg += f";[subbed]scale={out_w}:{out_h}:flags=lanczos[vout]"

    cmd += ["-filter_complex", fg, "-map", "[vout]", "-map", "0:a?"]
    cmd += ["-c:a", "copy"]

    # Encoder
    if hw:
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", "8M"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    cmd += [
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", f"{duration:.3f}",
        str(out_path),
    ]
    return cmd


def render_compose(
    video: Path,
    overlay: Optional[Path],
    ass_path: Path,
    out_path: Path,
    tpl: TemplateDef,
    highlight_phrases: Optional[list[dict]],
    resolution: str,
    duration: float = 0.0,
    on_progress: Optional[Callable[[float, str], None]] = None,
    video_pos: tuple[Optional[float], Optional[float]] = (None, None),
    highlight_effects: dict | None = None,
) -> None:
    if not video.exists():
        raise FileNotFoundError(f"video missing: {video}")
    if not ass_path.exists():
        raise FileNotFoundError(f"ass missing: {ass_path}")
    if overlay is not None and not overlay.exists():
        raise FileNotFoundError(f"overlay missing: {overlay}")
    if out_path.exists():
        out_path.unlink()

    # Need a positive duration for image overlay looping and the -t cap.
    if duration <= 0:
        # Fall back to probing the input.
        from media import probe_video
        info = probe_video(video)
        duration = info["duration"]
    if duration <= 0:
        duration = 1.0

    # Highlight phrase windows for blur effect.
    phrases: list[dict] = highlight_phrases or []

    out_w, out_h = resolution_dims(resolution, tpl)

    # Use the template's fps hint; default to 30 if input probe lacks it.
    fps = 30.0
    try:
        from media import probe_video
        fps = float(probe_video(video).get("fps", 30.0)) or 30.0
    except Exception:
        pass

    hw = _hw_encoder_available()
    cmd = _build_cmd(
        video, overlay, ass_path, out_path, tpl,
        phrases, out_w, out_h, fps, duration, hw,
        video_pos=video_pos,
        highlight_effects=highlight_effects,
    )

    if on_progress:
        on_progress(0.0, f"Compondo ({'HW' if hw else 'CPU'})...")

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
            # Capture last stderr lines for debugging.
            raise RuntimeError(f"ffmpeg exited with {rc} (veja logs/backend.log)")
        if on_progress:
            on_progress(1.0, "Render completo")
    finally:
        if proc.poll() is None:
            proc.kill()
