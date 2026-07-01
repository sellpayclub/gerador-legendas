"""Render individual clips with burned subtitles."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Callable, Optional

import keywords
from ass_gen import generate_ass
from clips import clip_dir, clip_output_path, load_clip_keywords, words_for_render
from media import ffmpeg_bin
from overlays import ComposeExtras, InstagramHeader
from presets import StyleConfig, apply_preset
from render import render_video
from templates import TemplateDef, get_template


def cut_video_segment(
    video: Path,
    out: Path,
    start_s: float,
    end_s: float,
) -> None:
    """Fast segment cut — re-encode for accurate seek + ASS compatibility."""
    duration = max(0.1, end_s - start_s)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    cmd = [
        ffmpeg_bin(), "-y",
        "-ss", f"{start_s:.3f}",
        "-i", str(video),
        "-t", f"{duration:.3f}",
        "-map", "0:v", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut failed: {proc.stderr[-600:]}")


def _resolve_template(template: str | None, aspect: str) -> TemplateDef | None:
    if template == "noticia_choquei":
        template = "reels_full"
    if template:
        return get_template(template)
    if aspect == "vertical":
        return get_template("reels_full")
    return None


def _video_pos_from_opts(compose_opts: dict | None) -> tuple[float, float]:
    opts = compose_opts or {}
    vpx = opts.get("video_pos_x")
    vpy = opts.get("video_pos_y")
    return (
        0.5 if vpx is None else max(0.0, min(1.0, float(vpx))),
        0.5 if vpy is None else max(0.0, min(1.0, float(vpy))),
    )


def render_clip(
    job_dir: Path,
    video_path: Path,
    words: list[dict],
    clip: dict,
    *,
    aspect: str = "original",
    template: str | None = None,
    preset: str | None = "capcut_amarelo",
    custom_style: dict | None = None,
    words_per_line: int = 4,
    resolution: str = "1080p",
    highlight_enabled: bool = False,
    overlay_asset: str | None = None,
    compose_opts: dict | None = None,
    on_progress: Optional[Callable[[float, str], None]] = None,
) -> Path:
    """Cut segment, generate ASS, burn subtitles → clips/{id}/output.mp4."""
    clip_id = clip["id"]
    start_s = float(clip["start_s"])
    end_s = float(clip["end_s"])
    duration = end_s - start_s

    cdir = clip_dir(job_dir, clip_id)
    raw_path = cdir / "raw.mp4"
    ass_path = cdir / "captions.ass"
    out_path = clip_output_path(job_dir, clip_id)

    if on_progress:
        on_progress(0.05, "Cortando vídeo...")
    cut_video_segment(video_path, raw_path, start_s, end_s)

    sliced = words_for_render(job_dir, words, clip)
    cfg: StyleConfig = apply_preset(preset, custom_style)

    highlight_phrases: list[dict] = []
    if highlight_enabled:
        kw = load_clip_keywords(job_dir, clip_id, sliced)
        indices = kw.get("indices") or []
        if indices:
            highlight_phrases = keywords.group_highlight_phrases(sliced, indices)

    tpl = _resolve_template(template, aspect)

    data = json.loads((job_dir / "words.json").read_text(encoding="utf-8"))
    if tpl:
        data["width"] = tpl.width
        data["height"] = tpl.height
        if cfg.pos_x is None:
            cfg.pos_x = float(tpl.subtitle_safe_x if tpl.subtitle_safe_x else tpl.width / 2)
        if cfg.pos_y is None:
            cfg.pos_y = float(tpl.subtitle_safe_y)
    else:
        from media import probe_video
        info = probe_video(raw_path)
        data["width"] = info["width"]
        data["height"] = info["height"]

    data["words"] = sliced
    data["duration"] = duration
    data["fps"] = data.get("fps", 30.0)

    if on_progress:
        on_progress(0.15, "Gerando legendas...")
    generate_ass(
        data, cfg, words_per_line, ass_path,
        None,
        highlight_enabled and bool(highlight_phrases),
        highlight_phrases if highlight_enabled else None,
        0.45,
    )

    if on_progress:
        on_progress(0.25, "Renderizando...")

    phrases_arg = highlight_phrases if highlight_enabled else None

    if tpl:
        import compose
        overlay_path: Path | None = None
        if overlay_asset:
            candidate = job_dir / "assets" / Path(overlay_asset).name
            if candidate.exists():
                overlay_path = candidate
        elif tpl.needs_overlay:
            raise RuntimeError("Este template exige mídia de overlay.")

        extras = ComposeExtras.from_dict(compose_opts or {}, job_dir)
        if clip.get("headline"):
            extras.headline_text = str(clip["headline"])
        if clip.get("caption"):
            if extras.instagram is None:
                extras.instagram = InstagramHeader()
            extras.instagram.caption = str(clip["caption"])

        compose.render_compose(
            raw_path, overlay_path, ass_path, out_path,
            tpl, phrases_arg, resolution,
            duration=duration,
            on_progress=lambda p, m: on_progress and on_progress(0.25 + p * 0.75, m),
            video_pos=_video_pos_from_opts(compose_opts),
            extras=extras,
            job_dir=job_dir,
        )
    else:
        render_video(
            raw_path, ass_path, out_path,
            duration=duration,
            on_progress=lambda p, m: on_progress and on_progress(0.25 + p * 0.75, m),
            highlight_phrases=phrases_arg,
        )

    return out_path
