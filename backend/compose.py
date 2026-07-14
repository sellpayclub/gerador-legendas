"""FFmpeg composition: templates + overlays + ASS subtitles."""
from __future__ import annotations

import platform
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Callable, Optional

from media import ffmpeg_bin, parse_progress, escape_filter_path as _escape_filter_path
from overlays import (
    ComposeExtras,
    clamp_progress_height_pct,
    fake_progress_expr,
    render_headline_png,
    render_instagram_header_png,
)
from templates import TemplateDef, resolution_dims

import effects as fx

FONTS_DIR = Path(__file__).resolve().parent / "fonts"
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


@lru_cache(maxsize=1)
def _hw_encoder_available() -> bool:
    if platform.system() != "Darwin":
        return False
    out = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-encoders"],
        capture_output=True, text=True, check=True, timeout=30,
    )
    return "h264_videotoolbox" in out.stdout


def _is_image(p: Path) -> bool:
    return p.suffix.lower() in _IMAGE_EXTS


def _headline_overlay_expr(extras: ComposeExtras, tpl: TemplateDef) -> tuple[str, str]:
    """Return (x_expr, y_expr) for centering headline PNG on the template division."""
    y_div = tpl.overlay_region.h
    align = extras.headline_align or "center"
    if align == "left":
        x_expr = "40"
    elif align == "right":
        x_expr = "W-w-40"
    else:
        x_expr = "(W-w)/2"
    y_expr = f"{y_div}-h/2"
    return x_expr, y_expr


def _progress_overlay_chain(
    extras: ComposeExtras,
    duration: float,
    canvas_w: int,
    canvas_h: int,
) -> tuple[str, str] | None:
    """Animated progress bar via color+overlay (much faster than scale=eval=frame)."""
    if not extras.progress_enabled:
        return None
    prog = fake_progress_expr(
        duration,
        fast_until=extras.progress_fast_until,
        fill_at=extras.progress_fill_at_fast,
    )
    h_pct = clamp_progress_height_pct(extras.progress_height_pct)
    color = extras.progress_color.lstrip("#")
    bar_h = max(1, round(canvas_h * h_pct))
    d = max(0.001, duration)
    pb_chain = f"color=c=0x{color}@1:s={canvas_w}x{bar_h}:d={d:.3f},format=rgba[pbar]"
    x_expr = f"-{canvas_w}+{canvas_w}*({prog})"
    return pb_chain, x_expr


def _append_post_ass_extras(
    fg: str,
    label: str,
    extras: ComposeExtras | None,
    duration: float,
    logo_input_idx: int | None,
    canvas_w: int,
    canvas_h: int,
) -> tuple[str, str]:
    out = label
    if not extras:
        return fg, out

    if extras.logo_path and logo_input_idx is not None:
        lw = max(8, round(canvas_w * extras.logo_scale))
        lx = f"(W-w)*{extras.logo_x:.3f}"
        ly = f"(H-h)*{extras.logo_y:.3f}"
        fg += f";[{logo_input_idx}:v]scale={lw}:-1[logo]"
        fg += f";[{out}][logo]overlay={lx}:{ly}[lg]"
        out = "lg"

    pb_info = _progress_overlay_chain(extras, duration, canvas_w, canvas_h)
    if pb_info:
        pb_chain, x_expr = pb_info
        fg += f";{pb_chain};[{out}][pbar]overlay=x='{x_expr}':y=H-h[pb]"
        out = "pb"

    return fg, out


def _build_vstack_cmd(
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
    video_pos: tuple[Optional[float], Optional[float]],
    extras: ComposeExtras | None,
    headline_png: Path | None = None,
) -> list[str]:
    cmd: list[str] = [ffmpeg_bin(), "-y", "-i", str(video)]
    next_idx = 1
    logo_input_idx: int | None = None
    headline_input_idx: int | None = None

    if overlay is not None:
        if _is_image(overlay):
            cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(overlay)]
        else:
            cmd += ["-stream_loop", "-1", "-i", str(overlay)]
        next_idx += 1

    if headline_png is not None:
        cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(headline_png)]
        headline_input_idx = next_idx
        next_idx += 1

    if extras and extras.logo_path and extras.logo_path.exists():
        cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(extras.logo_path)]
        logo_input_idx = next_idx

    vr = tpl.video_region
    orr = tpl.overlay_region
    vpx, vpy = video_pos
    vpx = 0.5 if vpx is None else max(0.0, min(1.0, float(vpx)))
    vpy = 0.5 if vpy is None else max(0.0, min(1.0, float(vpy)))

    fg = (
        f"[0:v]scale={vr.w}:{vr.h}:force_original_aspect_ratio=increase,"
        f"crop={vr.w}:{vr.h}:x='(iw-{vr.w})*{vpx:.3f}':y='(ih-{vr.h})*{vpy:.3f}',"
        f"setsar=1,fps={fps}[vsrc_raw]"
    )
    vsrc_label = "vsrc_raw"

    if overlay is not None:
        opx = max(0.0, min(1.0, float(extras.overlay_pos_x if extras else 0.5)))
        opy = max(0.0, min(1.0, float(extras.overlay_pos_y if extras else 0.5)))
        fg += (
            f";[1:v]scale={orr.w}:{orr.h}:force_original_aspect_ratio=increase,"
            f"crop={orr.w}:{orr.h}:x='(iw-{orr.w})*{opx:.3f}':y='(ih-{orr.h})*{opy:.3f}',"
            f"setsar=1,fps={fps}[ovr]"
        )
        fg += f";[ovr][{vsrc_label}]vstack=inputs=2[stacked]"
    else:
        fg += f";[{vsrc_label}]pad={tpl.width}:{tpl.height}:{orr.x}:{orr.y}:black[stacked]"

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
    canvas_label = "scaled"

    if headline_input_idx is not None and extras and extras.headline_text:
        x_expr, y_expr = _headline_overlay_expr(extras, tpl)
        fg += (
            f";[{canvas_label}][{headline_input_idx}:v]"
            f"overlay=x='{x_expr}':y='{y_expr}':format=auto[hl]"
        )
        canvas_label = "hl"

    ass_esc = _escape_filter_path(ass_path.resolve().as_posix())
    if FONTS_DIR.is_dir():
        fonts_esc = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        fg += f";[{canvas_label}]ass={ass_esc}:fontsdir={fonts_esc}[subbed]"
    else:
        fg += f";[{canvas_label}]ass={ass_esc}[subbed]"

    fg, final_label = _append_post_ass_extras(
        fg, "subbed", extras, duration, logo_input_idx, tpl.width, tpl.height,
    )
    fg += f";[{final_label}]scale={out_w}:{out_h}:flags=lanczos[vout]"

    cmd += ["-filter_complex", fg, "-map", "[vout]", "-map", "0:a?"]
    cmd += ["-c:a", "aac", "-b:a", "192k"]
    if hw:
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", "8M"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    cmd += ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", f"{duration:.3f}", str(out_path)]
    return cmd


def _build_header_hstack_cmd(
    video: Path,
    side_image: Path,
    ass_path: Path,
    out_path: Path,
    tpl: TemplateDef,
    highlight_phrases: list[dict],
    out_w: int,
    out_h: int,
    fps: float,
    duration: float,
    hw: bool,
    video_pos: tuple[Optional[float], Optional[float]],
    extras: ComposeExtras | None,
    header_png: Path,
) -> list[str]:
    cmd: list[str] = [ffmpeg_bin(), "-y", "-i", str(video)]
    cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(side_image)]
    cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(header_png)]
    logo_input_idx: int | None = None

    if extras and extras.logo_path and extras.logo_path.exists():
        cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(extras.logo_path)]
        logo_input_idx = 3

    lr = tpl.left_panel_region
    rr = tpl.right_panel_region
    assert lr and rr

    vpx, vpy = video_pos
    vpx = 0.5 if vpx is None else max(0.0, min(1.0, float(vpx)))
    vpy = 0.5 if vpy is None else max(0.0, min(1.0, float(vpy)))

    opx = max(0.0, min(1.0, float(extras.overlay_pos_x if extras else 0.5)))
    opy = max(0.0, min(1.0, float(extras.overlay_pos_y if extras else 0.5)))

    fg = (
        f"[1:v]scale={lr.w}:{lr.h}:force_original_aspect_ratio=increase,"
        f"crop={lr.w}:{lr.h}:x='(iw-{lr.w})*{opx:.3f}':y='(ih-{lr.h})*{opy:.3f}',"
        f"setsar=1,fps={fps}[left]"
        f";[0:v]scale={rr.w}:{rr.h}:force_original_aspect_ratio=increase,"
        f"crop={rr.w}:{rr.h}:x='(iw-{rr.w})*{vpx:.3f}':y='(ih-{rr.h})*{vpy:.3f}',"
        f"setsar=1,fps={fps}[right]"
        f";[left][right]hstack=inputs=2[row]"
        f";color=c=black:s={tpl.width}x{tpl.height}:d={duration:.3f}[bg]"
        f";[bg][row]overlay=0:{lr.y}[withrow]"
        f";[withrow][2:v]overlay=0:0[canvas]"
    )

    blur_expr = fx.blur_enable_expr(highlight_phrases) if highlight_phrases else ""
    if blur_expr:
        fg += (
            f";[canvas]gblur=sigma=28:enable='{blur_expr}',"
            f"eq=brightness=-0.14:saturation=0.75:enable='{blur_expr}'[blurred]"
        )
        canvas_label = "blurred"
    else:
        canvas_label = "canvas"

    ass_esc = _escape_filter_path(ass_path.resolve().as_posix())
    if FONTS_DIR.is_dir():
        fonts_esc = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        fg += f";[{canvas_label}]ass={ass_esc}:fontsdir={fonts_esc}[subbed]"
    else:
        fg += f";[{canvas_label}]ass={ass_esc}[subbed]"

    fg, final_label = _append_post_ass_extras(
        fg, "subbed", extras, duration, logo_input_idx, tpl.width, tpl.height,
    )
    fg += f";[{final_label}]scale={out_w}:{out_h}:flags=lanczos[vout]"

    cmd += ["-filter_complex", fg, "-map", "[vout]", "-map", "0:a?"]
    cmd += ["-c:a", "aac", "-b:a", "192k"]
    if hw:
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", "8M"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    cmd += ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", f"{duration:.3f}", str(out_path)]
    return cmd


def _run_compose_ffmpeg(
    cmd: list[str],
    duration: float,
    on_progress: Optional[Callable[[float, str], None]],
) -> tuple[int, str]:
    proc = subprocess.Popen(
        cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
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
        return proc.wait(), "".join(stderr_tail)[-800:]
    finally:
        if proc.poll() is None:
            proc.kill()


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
    extras: ComposeExtras | None = None,
    profile_path: Path | None = None,
    job_dir: Path | None = None,
) -> None:
    if not video.exists():
        raise FileNotFoundError(f"video missing: {video}")
    if not ass_path.exists():
        raise FileNotFoundError(f"ass missing: {ass_path}")
    if overlay is not None and not overlay.exists():
        raise FileNotFoundError(f"overlay missing: {overlay}")
    if out_path.exists():
        out_path.unlink()

    if duration <= 0:
        from media import probe_video
        info = probe_video(video)
        duration = info["duration"]
    if duration <= 0:
        duration = 1.0

    phrases: list[dict] = highlight_phrases or []
    out_w, out_h = resolution_dims(resolution, tpl)

    # Single probe call — extract fps and duration at once.
    from media import probe_video
    try:
        info = probe_video(video)
        fps = float(info.get("fps", 30.0)) or 30.0
        if duration <= 0:
            duration = info["duration"]
    except Exception:
        fps = 30.0

    header_png: Path | None = None
    headline_png: Path | None = None
    tmp_files: list[str] = []

    if tpl.layout == "header_hstack" and tpl.header_region:
        ig = extras.instagram if extras else None
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.close()
        tmp_files.append(tmp.name)
        header_png = Path(tmp.name)
        prof = profile_path
        if not prof and ig and ig.profile_asset and job_dir:
            prof = job_dir / "assets" / Path(ig.profile_asset).name
            if not prof.exists():
                prof = None
        render_instagram_header_png(
            header_png,
            width=tpl.header_region.w,
            height=tpl.header_region.h,
            username=ig.username if ig else "",
            caption=ig.caption if ig else "",
            profile_path=prof,
            bg_color=ig.bg_color if ig else "#FFFFFF",
            text_color=ig.text_color if ig else "#141414",
            avatar_size=ig.avatar_size if ig else 72,
            username_size=ig.username_size if ig else 34,
            caption_size=ig.caption_size if ig else 28,
        )

    if extras and extras.headline_text and tpl.id.startswith("choquei_"):
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.close()
        tmp_files.append(tmp.name)
        headline_png = Path(tmp.name)
        render_headline_png(headline_png, canvas_width=tpl.width, extras=extras)

    hw = _hw_encoder_available()

    def build_cmd(use_hw: bool) -> list[str]:
        if tpl.layout == "header_hstack":
            if overlay is None:
                raise RuntimeError("Notícia Choquei exige imagem no painel esquerdo.")
            if header_png is None:
                raise RuntimeError("Falha ao gerar header Instagram.")
            return _build_header_hstack_cmd(
                video, overlay, ass_path, out_path, tpl, phrases,
                out_w, out_h, fps, duration, use_hw, video_pos, extras, header_png,
            )
        return _build_vstack_cmd(
            video, overlay, ass_path, out_path, tpl, phrases,
            out_w, out_h, fps, duration, use_hw, video_pos, extras,
            headline_png=headline_png,
        )

    cmd = build_cmd(hw)

    if on_progress:
        on_progress(0.0, f"Compondo ({'HW' if hw else 'CPU'})...")

    try:
        rc, tail = _run_compose_ffmpeg(cmd, duration, on_progress)
        if rc != 0 and hw:
            if out_path.exists():
                out_path.unlink()
            if on_progress:
                on_progress(0.0, "Encoder de hardware indisponível; usando CPU...")
            rc, tail = _run_compose_ffmpeg(build_cmd(False), duration, on_progress)
        if rc != 0:
            raise RuntimeError(f"ffmpeg exited with {rc}: {tail}")
        if on_progress:
            on_progress(1.0, "Render completo")
    finally:
        for p in tmp_files:
            try:
                Path(p).unlink(missing_ok=True)
            except Exception:
                pass
