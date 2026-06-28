"""FFmpeg composition: templates + keyword zoom + ASS subtitles.

Builds a multi-input filtergraph that:
  1. scales+crops the original video into the template's video_region
  2. scales+crops the user-uploaded overlay into the overlay_region
  3. stacks the two regions into the template canvas (vstack for top/bottom)
  4. applies a smooth zoom-in pulse during each keyword (zoompan)
  5. burns the ASS subtitles
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


def _zoom_expr(intervals: list[dict], max_zoom: float = 1.3) -> str:
    """Build a zoompan `z` expression that pulses in during each keyword window
    and decays back to 1x otherwise.

    `intervals`: list of {start, end} in seconds.
    """
    # Default: gently decay toward 1x
    expr = "max(1,zoom-0.008)"
    # For each keyword, override with zoom-in during its window
    for iv in intervals:
        s = float(iv["start"])
        e = float(iv["end"])
        expr = f"if(between(time,{s},{e}),min(zoom+0.02,{max_zoom}),{expr})"
    return expr


def _build_cmd(
    video: Path,
    overlay: Optional[Path],
    ass_path: Path,
    out_path: Path,
    tpl: TemplateDef,
    kw_intervals: list[dict],
    out_w: int,
    out_h: int,
    fps: float,
    duration: float,
    hw: bool,
    video_pos: tuple[Optional[float], Optional[float]] = (None, None),
) -> list[str]:
    cmd: list[str] = [ffmpeg_bin(), "-y"]

    # Input 0: original video (audio preserved)
    cmd += ["-i", str(video)]

    # Input 1: overlay asset
    ovr_label = None
    if overlay is not None:
        if _is_image(overlay):
            cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(overlay)]
        else:
            cmd += ["-stream_loop", "-1", "-i", str(overlay)]

    # ----- filtergraph -----
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
        f"setsar=1,fps={fps}[vsrc]"
    )

    if overlay is not None:
        # Overlay -> overlay_region (cover)
        fg += (
            f";[1:v]scale={orr.w}:{orr.h}:force_original_aspect_ratio=increase,"
            f"crop={orr.w}:{orr.h},setsar=1,fps={fps}[ovr]"
        )
        # Stack vertically: overlay on top, video on bottom
        fg += f";[ovr][vsrc]vstack=inputs=2[stacked]"
    else:
        # Fallback (template without overlay): pad video into canvas.
        fg += (
            f";[vsrc]pad={tpl.width}:{tpl.height}:{orr.x}:{orr.y}:black[stacked]"
        )

    # Keyword zoom (or identity scale)
    if kw_intervals:
        z = _zoom_expr(kw_intervals)
        fg += (
            f";[stacked]zoompan=z='{z}':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d=1:s={tpl.width}x{tpl.height}:fps={fps}[zoomed]"
        )
    else:
        fg += f";[stacked]scale={tpl.width}:{tpl.height}:flags=lanczos[zoomed]"

    # ASS subtitles
    ass_esc = _escape_filter_path(ass_path.resolve().as_posix())
    if FONTS_DIR.is_dir():
        fonts_esc = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        fg += f";[zoomed]ass={ass_esc}:fontsdir={fonts_esc}[subbed]"
    else:
        fg += f";[zoomed]ass={ass_esc}[subbed]"

    # Final scale to chosen resolution
    fg += f";[subbed]scale={out_w}:{out_h}:flags=lanczos[vout]"

    cmd += ["-filter_complex", fg, "-map", "[vout]", "-map", "0:a?"]

    # Encoder
    if hw:
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", "8M"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    cmd += [
        "-c:a", "aac", "-b:a", "128k",
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
    keywords: Optional[list[int]],
    resolution: str,
    duration: float = 0.0,
    on_progress: Optional[Callable[[float, str], None]] = None,
    video_pos: tuple[Optional[float], Optional[float]] = (None, None),
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

    # Resolve keyword time intervals from word indices.
    kw_intervals: list[dict] = []
    if keywords:
        # Read words.json (sits next to the ASS file in the job dir).
        import json
        wpath = ass_path.parent / "words.json"
        if wpath.exists():
            try:
                words = json.loads(wpath.read_text(encoding="utf-8")).get("words", [])
                for i in keywords:
                    if 0 <= i < len(words):
                        w = words[i]
                        kw_intervals.append({
                            "start": float(w.get("start", 0.0)),
                            "end": float(w.get("end", w.get("start", 0.0))),
                        })
            except Exception:
                pass

    # Output resolution from template aspect + chosen preset.
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
        kw_intervals, out_w, out_h, fps, duration, hw,
        video_pos=video_pos,
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
