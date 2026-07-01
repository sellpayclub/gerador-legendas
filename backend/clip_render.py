"""Render individual clips with burned subtitles."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Callable, Optional

import keywords
from ass_gen import generate_ass
from clips import clip_dir, clip_output_path, load_clip_keywords, words_for_render
from media import ffmpeg_bin, parse_progress
from presets import StyleConfig, apply_preset
from render import render_video
from templates import get_template


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


def render_clip(
    job_dir: Path,
    video_path: Path,
    words: list[dict],
    clip: dict,
    *,
    aspect: str = "original",
    preset: str | None = "capcut_amarelo",
    custom_style: dict | None = None,
    words_per_line: int = 4,
    resolution: str = "1080p",
    highlight_enabled: bool = False,
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

    data = json.loads((job_dir / "words.json").read_text(encoding="utf-8"))
    tpl = get_template("reels_full") if aspect == "vertical" else None

    if tpl:
        data["width"] = tpl.width
        data["height"] = tpl.height
        if cfg.pos_x is None:
            cfg.pos_x = float(tpl.width / 2)
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
        compose.render_compose(
            raw_path, None, ass_path, out_path,
            tpl, phrases_arg, resolution,
            duration=duration,
            on_progress=lambda p, m: on_progress and on_progress(0.25 + p * 0.75, m),
            video_pos=(0.5, 0.5),
        )
    else:
        render_video(
            raw_path, ass_path, out_path,
            duration=duration,
            on_progress=lambda p, m: on_progress and on_progress(0.25 + p * 0.75, m),
            highlight_phrases=phrases_arg,
        )

    return out_path
