"""FFmpeg composition: templates + overlays + ASS subtitles."""
from __future__ import annotations

import platform
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Optional

from media import ffmpeg_bin, parse_progress
from overlays import (
    ComposeExtras,
    escape_drawtext,
    fake_progress_expr,
    render_instagram_header_png,
    wrap_headline_text,
)
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


def _font_file() -> Path | None:
    for name in ("Roboto-Bold.ttf", "Inter-Bold.ttf", "Roboto-Regular.ttf"):
        p = FONTS_DIR / name
        if p.exists():
            return p
    return None


def _headline_drawtext(extras: ComposeExtras, tpl: TemplateDef) -> str | None:
    text = (extras.headline_text or "").strip()
    if not text or not tpl.id.startswith("choquei_"):
        return None
    if extras.headline_style == "bold_red":
        raw = text.upper()
        bg = extras.headline_bg.lstrip("#")
        fg = extras.headline_color.lstrip("#")
        border = 24
    else:
        raw = text
        bg = extras.headline_bg.lstrip("#") if extras.headline_bg else "000000"
        fg = extras.headline_color.lstrip("#") if extras.headline_color else "FFFFFF"
        border = 8
    font = _font_file()
    if not font:
        return None
    fs = max(20, min(80, int(extras.headline_font_size or 42)))
    display = wrap_headline_text(
        raw, tpl.width, fs, extras.headline_max_width_pct,
    )
    y_div = tpl.overlay_region.h
    y = max(0, y_div - int(fs * 0.9))
    esc = escape_drawtext(display)
    font_esc = _escape_filter_path(font.resolve().as_posix())
    align = extras.headline_align or "center"
    if align == "left":
        x_expr = "40"
    elif align == "right":
        x_expr = "w-text_w-40"
    else:
        x_expr = "(w-text_w)/2"
    return (
        f"drawtext=fontfile='{font_esc}':text='{esc}':fontsize={fs}:"
        f"fontcolor=0x{fg}:box=1:boxcolor=0x{bg}@0.92:boxborderw={border}:"
        f"x={x_expr}:y={y}"
    )


def _progress_drawbox(extras: ComposeExtras, duration: float) -> str | None:
    if not extras.progress_enabled:
        return None
    prog = fake_progress_expr(
        duration,
        fast_until=extras.progress_fast_until,
        fill_at=extras.progress_fill_at_fast,
    )
    h_pct = extras.progress_height_pct
    color = extras.progress_color.lstrip("#")
    return (
        f"drawbox=x=0:y=ih*(1-{h_pct:.4f}):w='iw*({prog})':h=ih*{h_pct:.4f}:"
        f"color=0x{color}@1:t=fill"
    )


def _append_post_ass_extras(
    fg: str,
    label: str,
    extras: ComposeExtras | None,
    duration: float,
    logo_input_idx: int | None,
    canvas_w: int,
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

    pb = _progress_drawbox(extras, duration)
    if pb:
        fg += f";[{out}]{pb}[pb]"
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
) -> list[str]:
    cmd: list[str] = [ffmpeg_bin(), "-y", "-i", str(video)]
    next_idx = 1
    logo_input_idx: int | None = None

    if overlay is not None:
        if _is_image(overlay):
            cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(overlay)]
        else:
            cmd += ["-stream_loop", "-1", "-i", str(overlay)]
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

    if extras and extras.headline_text and tpl.id.startswith("choquei_"):
        dt = _headline_drawtext(extras, tpl)
        if dt:
            fg += f";[{canvas_label}]{dt}[hl]"
            canvas_label = "hl"

    ass_esc = _escape_filter_path(ass_path.resolve().as_posix())
    if FONTS_DIR.is_dir():
        fonts_esc = _escape_filter_path(FONTS_DIR.resolve().as_posix())
        fg += f";[{canvas_label}]ass={ass_esc}:fontsdir={fonts_esc}[subbed]"
    else:
        fg += f";[{canvas_label}]ass={ass_esc}[subbed]"

    fg, final_label = _append_post_ass_extras(
        fg, "subbed", extras, duration, logo_input_idx, tpl.width,
    )
    fg += f";[{final_label}]scale={out_w}:{out_h}:flags=lanczos[vout]"

    cmd += ["-filter_complex", fg, "-map", "[vout]", "-map", "0:a?"]
    cmd += ["-c:a", "copy"]
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
        fg, "subbed", extras, duration, logo_input_idx, tpl.width,
    )
    fg += f";[{final_label}]scale={out_w}:{out_h}:flags=lanczos[vout]"

    cmd += ["-filter_complex", fg, "-map", "[vout]", "-map", "0:a?"]
    cmd += ["-c:a", "copy"]
    if hw:
        cmd += ["-c:v", "h264_videotoolbox", "-b:v", "8M"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    cmd += ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", f"{duration:.3f}", str(out_path)]
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

    fps = 30.0
    try:
        from media import probe_video
        fps = float(probe_video(video).get("fps", 30.0)) or 30.0
    except Exception:
        pass

    header_png: Path | None = None
    tmp_name: str | None = None

    if tpl.layout == "header_hstack" and tpl.header_region:
        ig = extras.instagram if extras else None
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp_name = tmp.name
        tmp.close()
        header_png = Path(tmp_name)
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

    hw = _hw_encoder_available()

    if tpl.layout == "header_hstack":
        if overlay is None:
            raise RuntimeError("Notícia Choquei exige imagem no painel esquerdo.")
        if header_png is None:
            raise RuntimeError("Falha ao gerar header Instagram.")
        cmd = _build_header_hstack_cmd(
            video, overlay, ass_path, out_path, tpl, phrases,
            out_w, out_h, fps, duration, hw, video_pos, extras, header_png,
        )
    else:
        cmd = _build_vstack_cmd(
            video, overlay, ass_path, out_path, tpl, phrases,
            out_w, out_h, fps, duration, hw, video_pos, extras,
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
            raise RuntimeError(f"ffmpeg exited with {rc} (veja logs/backend.log)")
        if on_progress:
            on_progress(1.0, "Render completo")
    finally:
        if proc.poll() is None:
            proc.kill()
        if tmp_name:
            try:
                Path(tmp_name).unlink(missing_ok=True)
            except Exception:
                pass