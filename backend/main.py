"""FastAPI app: upload, transcribe, edit words, render, SSE events."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

import jobs
from jobs import Job, Stage, create_job, get_job, event_stream, cleanup_old_jobs, rehydrate_jobs
from media import ensure_ffmpeg, extract_audio, ffmpeg_bin, probe_video
from presets import StyleConfig, apply_preset, list_presets
from ass_gen import generate_ass
from render import render_video
from transcribe import transcribe
import templates
from templates import get_template
import keywords
import enrich
import clips
from clip_render import render_clip
from overlays import ComposeExtras, InstagramHeader
import app_settings
from media import ffmpeg_ok
from auth import UserContext
from deps import (
    mt_active_user, mt_active_user_media, mt_openai_user, resolve_job,
    mt_export_user, mt_export_user_media,
)
from request_context import set_current_user_id, user_api_context
from tenant import is_multi_tenant
from routes_me import router as hosted_router
from routes_admin import router as admin_router
from mobile_access import router as mobile_router

log = logging.getLogger("legendas.main")

# ---------------------------------------------------------------------------
#  Simple in-memory rate limiter for expensive endpoints
# ---------------------------------------------------------------------------
from collections import defaultdict as _defaultdict

_rate_buckets: dict[str, list[float]] = _defaultdict(list)
_RATE_WINDOW_S = 60


def _positive_env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except (TypeError, ValueError):
        return default


# FFmpeg saturates CPU/GPU and disk quickly. Queue excess work instead of
# letting concurrent users make every render slower or crash the worker.
_render_slots = asyncio.Semaphore(_positive_env_int("MAX_CONCURRENT_RENDERS", 1))
_clip_detect_slots = asyncio.Semaphore(_positive_env_int("MAX_CONCURRENT_CLIP_DETECTIONS", 2))


def _rate_limit_request(
    key: str,
    max_per_min: int,
    request: Request,
    identity: str | None = None,
) -> None:
    """Raise 429 if the client IP exceeds max_per_min within 60s."""
    if identity:
        subject = f"user:{identity}"
    else:
        from client_ip import get_client_ip
        subject = f"ip:{get_client_ip(request)}"
    bucket = f"{key}:{subject}"
    now = time.monotonic()
    _rate_buckets[bucket] = [t for t in _rate_buckets[bucket] if now - t < _RATE_WINDOW_S]
    if len(_rate_buckets[bucket]) >= max_per_min:
        raise HTTPException(429, "Muitas requisições. Aguarde um momento.")
    _rate_buckets[bucket].append(now)

_clip_detect_running: set[str] = set()
_clip_render_running: set[str] = set()
_video_render_running: set[str] = set()


def _clip_render_key(job_id: str, clip_id: str) -> str:
    return f"{job_id}:clip:{clip_id}"


def _batch_render_key(job_id: str) -> str:
    return f"{job_id}:batch"


def _job_has_active_clip_render(job_id: str) -> bool:
    prefix = f"{job_id}:"
    return any(k.startswith(prefix) for k in _clip_render_running)


def _recover_stale_render_state(job: Job) -> None:
    """Unlock UI when no render task is active but job/clips still say 'rendering'."""
    job_id = job.id
    if _job_has_active_clip_render(job_id):
        return
    if job.stage in (Stage.RENDERING, Stage.GENERATING_ASS):
        job.update(Stage.TRANSCRIBED, 1.0, "Transcrição pronta")
    data = clips.load_clips(job.job_dir())
    if not data:
        return
    clip_list = data.get("clips") or []
    changed = False
    for c in clip_list:
        if c.get("status") == "rendering":
            c["status"] = "pending"
            changed = True
    if changed:
        clips.update_clips(job.job_dir(), clip_list, manual=True)

app = FastAPI(title="Legendas Locais")
app.include_router(hosted_router)
app.include_router(admin_router)
app.include_router(mobile_router)

@app.middleware("http")
async def _inject_user_context(request, call_next):
    auth = request.headers.get("authorization") or ""
    if auth.startswith("Bearer "):
        from auth import decode_bearer_token

        try:
            payload = decode_bearer_token(auth[7:].strip())
            sub = payload.get("sub")
            if sub:
                set_current_user_id(str(sub))
        except Exception:
            log.debug("failed to decode bearer token for user context injection")
    return await call_next(request)


@app.middleware("http")
async def _security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=()"
    )
    if is_multi_tenant():
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


def _cors_origins() -> list[str]:
    origins = app_settings.get_allowed_origins()
    if origins and "*" not in origins:
        return origins
    return [
        o.strip()
        for o in os.environ.get(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,https://app.clipsaas.site",
        ).split(",")
        if o.strip()
    ]


def _configure_cors() -> None:
    origins = _cors_origins()
    if app_settings.cors_allow_all() or not origins:
        if is_multi_tenant():
            # In hosted mode, NEVER allow wildcard CORS — force explicit origins.
            log.error(
                "CORS allow-all is BLOCKED in multi-tenant mode. "
                "Set ALLOWED_ORIGINS explicitly. Falling back to APP_PUBLIC_URL."
            )
            public_url = os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/")
            if public_url:
                origins = [public_url]
            else:
                origins = ["https://app.clipsaas.site"]
            app.add_middleware(
                CORSMiddleware,
                allow_origins=origins,
                allow_credentials=True,
                allow_methods=["*"],
                allow_headers=["*"],
            )
        else:
            log.warning(
                "CORS allow-all mode enabled (self-hosted). "
                "Set ALLOWED_ORIGINS explicitly for production."
            )
            app.add_middleware(
                CORSMiddleware,
                allow_origin_regex=r"https?://.*",
                allow_credentials=False,
                allow_methods=["*"],
                allow_headers=["*"],
            )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )


_configure_cors()


@app.on_event("startup")
async def _startup() -> None:
    ensure_ffmpeg()
    cleanup_old_jobs()
    rehydrate_jobs()
    asyncio.create_task(_periodic_cleanup())
    asyncio.create_task(_resume_incomplete_jobs())


async def _resume_incomplete_jobs() -> None:
    """Restart upload/transcribe pipelines interrupted by a server restart."""
    await asyncio.sleep(0.5)
    for job in list(jobs.list_jobs()):
        if job.words_path and job.words_path.exists():
            continue
        if job.stage == Stage.ERROR:
            continue
        if not job.video_path or not job.video_path.exists():
            continue
        if job.audio_path and job.audio_path.exists():
            job.update(Stage.AUDIO_READY, 1.0, "Retomando transcrição...")
            asyncio.create_task(_run_transcribe(job))
        elif job.stage in (Stage.QUEUED, Stage.EXTRACTING_AUDIO):
            job.update(Stage.QUEUED, 0.0, "Retomando processamento...")
            asyncio.create_task(_process_upload(job))


async def _periodic_cleanup() -> None:
    """Periodically purge old jobs so videos don't accumulate on disk."""
    while True:
        await asyncio.sleep(3600)
        try:
            cleanup_old_jobs()
        except Exception:
            pass


# ---------- schemas ----------

class WordsUpdate(BaseModel):
    words: list[dict]


class RenderRequest(BaseModel):
    preset: str | None = None
    custom: dict | None = None
    words_per_line: int = 3
    pos_x: float | None = None
    pos_y: float | None = None
    template: str | None = None
    resolution: str = "1080p"
    highlight_enabled: bool = False
    keywords: list[int] | None = None
    highlight_effects: dict | None = None  # per-phrase: key = first word index
    overlay_asset: str | None = None
    profile_asset: str | None = None
    video_pos_x: float | None = None
    video_pos_y: float | None = None
    headline_text: str | None = None
    headline_style: str = "bold_red"
    headline_bg: str = "#E31B23"
    headline_color: str = "#FFFFFF"
    headline_font_size: int = 42
    headline_align: str = "center"
    headline_max_width_pct: float = 0.85
    instagram_username: str | None = None
    instagram_caption: str | None = None
    logo_asset: str | None = None
    logo_x: float = 0.85
    logo_y: float = 0.78
    logo_scale: float = 0.18
    progress_enabled: bool = False
    progress_color: str = "#E31B23"
    progress_height_pct: float = 0.04
    overlay_pos_x: float = 0.5
    overlay_pos_y: float = 0.5
    ig_bg_color: str = "#FFFFFF"
    ig_text_color: str = "#141414"
    ig_avatar_size: int = 72
    ig_username_size: int = 34
    ig_caption_size: int = 28


class KeywordsUpdate(BaseModel):
    indices: list[int]
    effects: dict | None = None


class EnrichRequest(BaseModel):
    punctuation: bool = True
    emojis: bool = False


class ClipsUpdate(BaseModel):
    clips: list[dict]


class SyncEditingRequest(BaseModel):
    source_clip_id: str


class ClipsSettingsUpdate(BaseModel):
    style: dict | None = None
    preset: str | None = None
    words_per_line: int | None = None
    aspect: str | None = None
    template: str | None = None
    resolution: str | None = None
    highlight_enabled: bool | None = None
    overlay_asset: str | None = None
    profile_asset: str | None = None
    instagram_username: str | None = None
    logo_asset: str | None = None
    logo_x: float | None = None
    logo_y: float | None = None
    logo_scale: float | None = None
    progress_enabled: bool | None = None
    progress_color: str | None = None
    progress_height_pct: float | None = None
    headline_style: str | None = None
    headline_bg: str | None = None
    headline_color: str | None = None
    headline_font_size: int | None = None
    headline_align: str | None = None
    headline_max_width_pct: float | None = None
    overlay_pos_x: float | None = None
    overlay_pos_y: float | None = None
    video_pos_x: float | None = None
    video_pos_y: float | None = None
    ig_bg_color: str | None = None
    ig_text_color: str | None = None
    ig_avatar_size: int | None = None
    ig_username_size: int | None = None
    ig_caption_size: int | None = None
    format_presets: dict | None = None


class ClipWordsUpdate(BaseModel):
    words: list[dict]


class ClipKeywordsUpdate(BaseModel):
    indices: list[int]
    effects: dict | None = None


class DetectClipsRequest(BaseModel):
    """Focos editoriais opcionais (ex.: polemico, engracado) para direcionar a IA."""
    focuses: list[str] = []


class ClipsRenderRequest(BaseModel):
    clip_ids: list[str]
    # None => usa o valor salvo em clips.json (merge em _render_opts_from_request).
    aspect: str | None = None
    template: str | None = None
    preset: str | None = "capcut_amarelo"
    custom: dict | None = None
    words_per_line: int = 4
    resolution: str = "1080p"
    highlight_enabled: bool | None = None
    overlay_asset: str | None = None
    profile_asset: str | None = None
    instagram_username: str | None = None
    logo_asset: str | None = None
    logo_x: float | None = None
    logo_y: float | None = None
    logo_scale: float | None = None
    progress_enabled: bool | None = None
    progress_color: str | None = None
    progress_height_pct: float | None = None
    headline_style: str | None = None
    headline_bg: str | None = None
    headline_color: str | None = None
    headline_font_size: int | None = None
    headline_align: str | None = None
    headline_max_width_pct: float | None = None
    overlay_pos_x: float | None = None
    overlay_pos_y: float | None = None
    video_pos_x: float | None = None
    video_pos_y: float | None = None
    ig_bg_color: str | None = None
    ig_text_color: str | None = None
    ig_avatar_size: int | None = None
    ig_username_size: int | None = None
    ig_caption_size: int | None = None


class SingleClipRenderRequest(BaseModel):
    # None => usa o valor salvo em clips.json (merge em _render_opts_from_request).
    aspect: str | None = None
    template: str | None = None
    preset: str | None = "capcut_amarelo"
    custom: dict | None = None
    words_per_line: int = 4
    resolution: str = "1080p"
    highlight_enabled: bool | None = None
    overlay_asset: str | None = None
    profile_asset: str | None = None
    instagram_username: str | None = None
    logo_asset: str | None = None
    logo_x: float | None = None
    logo_y: float | None = None
    logo_scale: float | None = None
    progress_enabled: bool | None = None
    progress_color: str | None = None
    progress_height_pct: float | None = None
    headline_style: str | None = None
    headline_bg: str | None = None
    headline_color: str | None = None
    headline_font_size: int | None = None
    headline_align: str | None = None
    headline_max_width_pct: float | None = None
    overlay_pos_x: float | None = None
    overlay_pos_y: float | None = None
    video_pos_x: float | None = None
    video_pos_y: float | None = None
    ig_bg_color: str | None = None
    ig_text_color: str | None = None
    ig_avatar_size: int | None = None
    ig_username_size: int | None = None
    ig_caption_size: int | None = None


def _asset_path(job_dir: Path, filename: str | None) -> Path | None:
    if not filename:
        return None
    p = job_dir / "assets" / Path(filename).name
    return p if p.exists() else None


def _compose_dict_from_saved(saved: dict) -> dict:
    return {
        "headline_style": saved.get("headline_style", "bold_red"),
        "headline_bg": saved.get("headline_bg", "#E31B23"),
        "headline_color": saved.get("headline_color", "#FFFFFF"),
        "headline_font_size": saved.get("headline_font_size", 42),
        "headline_align": saved.get("headline_align", "center"),
        "headline_max_width_pct": saved.get("headline_max_width_pct", 0.85),
        "overlay_pos_x": saved.get("overlay_pos_x", 0.5),
        "overlay_pos_y": saved.get("overlay_pos_y", 0.5),
        "video_pos_x": saved.get("video_pos_x", 0.5),
        "video_pos_y": saved.get("video_pos_y", 0.5),
        "logo_asset": saved.get("logo_asset"),
        "logo_x": saved.get("logo_x", 0.85),
        "logo_y": saved.get("logo_y", 0.78),
        "logo_scale": saved.get("logo_scale", 0.18),
        "progress_enabled": saved.get("progress_enabled", False),
        "progress_color": saved.get("progress_color", "#E31B23"),
        "progress_height_pct": saved.get("progress_height_pct", 0.04),
        "ig_bg_color": saved.get("ig_bg_color", "#FFFFFF"),
        "ig_text_color": saved.get("ig_text_color", "#141414"),
        "ig_avatar_size": saved.get("ig_avatar_size", 72),
        "ig_username_size": saved.get("ig_username_size", 34),
        "ig_caption_size": saved.get("ig_caption_size", 28),
        "instagram": {
            "profile_asset": saved.get("profile_asset"),
            "username": saved.get("instagram_username") or "",
            "caption": "",
            "bg_color": saved.get("ig_bg_color", "#FFFFFF"),
            "text_color": saved.get("ig_text_color", "#141414"),
            "avatar_size": saved.get("ig_avatar_size", 72),
            "username_size": saved.get("ig_username_size", 34),
            "caption_size": saved.get("ig_caption_size", 28),
        },
    }


_COMPOSE_FLAT_KEYS = (
    "overlay_asset", "profile_asset", "instagram_username", "logo_asset",
    "logo_x", "logo_y", "logo_scale", "progress_enabled", "progress_color",
    "progress_height_pct", "headline_style", "headline_bg", "headline_color",
    "headline_font_size", "headline_align", "headline_max_width_pct", "overlay_pos_x", "overlay_pos_y",
    "video_pos_x", "video_pos_y", "ig_bg_color", "ig_text_color",
    "ig_avatar_size", "ig_username_size", "ig_caption_size",
)

_IG_KEY_MAP = {
    "profile_asset": "profile_asset",
    "instagram_username": "username",
    "ig_bg_color": "bg_color",
    "ig_text_color": "text_color",
    "ig_avatar_size": "avatar_size",
    "ig_username_size": "username_size",
    "ig_caption_size": "caption_size",
}


def _compose_extras_from_render(body: RenderRequest, job_dir: Path) -> ComposeExtras:
    d = {
        "headline_text": body.headline_text,
        "headline_style": body.headline_style,
        "headline_bg": body.headline_bg,
        "headline_color": body.headline_color,
        "headline_font_size": body.headline_font_size,
        "headline_align": body.headline_align,
        "headline_max_width_pct": body.headline_max_width_pct,
        "overlay_pos_x": body.overlay_pos_x,
        "overlay_pos_y": body.overlay_pos_y,
        "logo_asset": body.logo_asset,
        "logo_x": body.logo_x,
        "logo_y": body.logo_y,
        "logo_scale": body.logo_scale,
        "progress_enabled": body.progress_enabled,
        "progress_color": body.progress_color,
        "progress_height_pct": body.progress_height_pct,
        "instagram": {
            "profile_asset": body.profile_asset,
            "username": body.instagram_username or "",
            "caption": body.instagram_caption or "",
            "bg_color": body.ig_bg_color,
            "text_color": body.ig_text_color,
            "avatar_size": body.ig_avatar_size,
            "username_size": body.ig_username_size,
            "caption_size": body.ig_caption_size,
        },
    }
    return ComposeExtras.from_dict(d, job_dir)


def _resolve_template_id(aspect: str | None, template: str | None) -> str | None:
    if template:
        return template
    if aspect == "vertical":
        return "reels_full"
    return None


def _render_opts_from_request(body: ClipsRenderRequest | SingleClipRenderRequest, job_dir: Path) -> dict:
    saved = clips.load_clips(job_dir) or {}
    hl = getattr(body, "highlight_enabled", None)
    if hl is None:
        hl = saved.get("highlight_enabled", False)
    template = getattr(body, "template", None) or saved.get("template")
    aspect = getattr(body, "aspect", None) or saved.get("aspect", "vertical")
    if not template:
        template = _resolve_template_id(aspect, None)
    compose_base = _compose_dict_from_saved(saved)
    for key in _COMPOSE_FLAT_KEYS:
        val = getattr(body, key, None)
        if val is not None:
            if key in _IG_KEY_MAP:
                compose_base["instagram"][_IG_KEY_MAP[key]] = val
            else:
                compose_base[key] = val
        elif key in saved and key not in ("overlay_asset", "profile_asset", "instagram_username"):
            compose_base[key] = saved[key]
        elif key == "overlay_asset" and saved.get("overlay_asset"):
            compose_base["overlay_asset"] = saved["overlay_asset"]
        elif key == "profile_asset" and saved.get("profile_asset"):
            compose_base["instagram"]["profile_asset"] = saved["profile_asset"]
        elif key == "instagram_username" and saved.get("instagram_username"):
            compose_base["instagram"]["username"] = saved["instagram_username"]
    return {
        "aspect": aspect,
        "template": template,
        "preset": body.preset if body.preset is not None else saved.get("preset", "capcut_amarelo"),
        "custom_style": body.custom if body.custom is not None else saved.get("style"),
        "words_per_line": body.words_per_line or saved.get("words_per_line", 4),
        "resolution": body.resolution or saved.get("resolution", "1080p"),
        "highlight_enabled": bool(hl),
        "overlay_asset": getattr(body, "overlay_asset", None) or saved.get("overlay_asset"),
        "compose": compose_base,
    }


def _persist_clip_status(job_dir: Path, clip: dict) -> None:
    clips_data = clips.load_clips(job_dir) or {"clips": []}
    clip_list = clips_data.get("clips") or []
    for i, c in enumerate(clip_list):
        if c.get("id") == clip["id"]:
            clip_list[i] = {**c, **clip}
            break
    clips.update_clips(job_dir, clip_list, manual=True)


def _sync_render_one_clip(
    job: Job,
    clip: dict,
    opts: dict,
    on_progress=None,
) -> None:
    with user_api_context(job.user_id):
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
        words = data.get("words", [])
        clip["status"] = "rendering"
        clip["error"] = None
        _persist_clip_status(job.job_dir(), clip)
        try:
            render_clip(
                job.job_dir(), job.video_path, words, clip,
                aspect=opts["aspect"],
                template=opts.get("template"),
                preset=opts["preset"],
                custom_style=opts["custom_style"],
                words_per_line=opts["words_per_line"],
                resolution=opts["resolution"],
                highlight_enabled=opts.get("highlight_enabled", False),
                overlay_asset=clip.get("overlay_asset") or opts.get("overlay_asset"),
                compose_opts=opts.get("compose"),
                on_progress=on_progress,
            )
            clip["status"] = "done"
            clip.pop("error", None)
        except Exception as e:
            clip["status"] = "error"
            clip["error"] = str(e)
        _persist_clip_status(job.job_dir(), clip)


# ---------- routes ----------

@app.get("/api/health")
async def health() -> dict:
    s = app_settings.get()
    mt = is_multi_tenant()
    return {
        "ok": True,
        "multi_tenant": mt,
        "openai_configured": s.openai_configured() if not mt else None,
        "transcribe_engine": s.transcribe_engine,
        "transcribe_ready": s.transcribe_ready(),
        "ffmpeg_ok": ffmpeg_ok(),
        "job_max_age_hours": __import__("tenant").job_max_age_hours() if mt else None,
    }


class SettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    transcribe_engine: Optional[str] = None
    openai_model: Optional[str] = None
    clips_model: Optional[str] = None
    keywords_model: Optional[str] = None
    enrich_model: Optional[str] = None
    allowed_origins: Optional[list[str]] = None
    public_domain: Optional[str] = None


class SettingsTestBody(BaseModel):
    openai_api_key: Optional[str] = None


@app.get("/api/settings")
async def get_settings_route() -> dict:
    if is_multi_tenant():
        raise HTTPException(403, "Use /api/me em modo hosted.")
    return app_settings.to_public()


@app.put("/api/settings")
async def put_settings_route(body: SettingsUpdate) -> dict:
    if is_multi_tenant():
        raise HTTPException(403, "Use /api/me/settings em modo hosted.")
    patch = body.model_dump(exclude_unset=True)
    app_settings.save(patch)
    return app_settings.to_public()


@app.post("/api/settings/test")
async def test_settings_route(request: Request, body: SettingsTestBody | None = None) -> dict:
    if is_multi_tenant():
        raise HTTPException(403, "Use /api/me/settings/test em modo hosted.")
    _rate_limit_request("settings-test", 5, request)  # max 5/min per IP
    import requests
    from openai_chat import build_chat_payload

    key = (body.openai_api_key if body and body.openai_api_key else app_settings.get().openai_api_key).strip()
    if not key or key.startswith("••"):
        raise HTTPException(400, "Informe uma API key válida para testar")
    url = app_settings.get_openai_chat_url()
    model = app_settings.get_clips_model()
    try:
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=build_chat_payload(
                model,
                [{"role": "user", "content": "Responda apenas: ok"}],
                max_tokens=16,
            ),
            timeout=30,
        )
        if resp.status_code != 200:
            return {"ok": False, "message": resp.text[:300]}
        return {"ok": True, "message": "Conexão com OpenAI OK"}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "message": "Falha de conexão com OpenAI. Verifique a URL e tente novamente."}
    except requests.exceptions.Timeout:
        return {"ok": False, "message": "OpenAI demorou demais para responder. Tente novamente."}
    except Exception as exc:
        log.warning("settings test failed: %s", exc)
        return {"ok": False, "message": "Erro ao testar conexão com OpenAI."}


@app.get("/api/presets")
async def presets_list() -> dict:
    return list_presets()


@app.get("/api/templates")
async def templates_list() -> dict:
    return {"templates": templates.list_templates(), "resolutions": templates.list_resolutions()}


# Allowed file types for template overlay assets.
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
_VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}
_ASSET_EXTS = _IMAGE_EXTS | _VIDEO_EXTS


@app.post("/api/jobs/{job_id}/assets")
async def upload_asset(job_id: str, file: UploadFile = File(...),
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    if not file.filename:
        raise HTTPException(400, "filename is required")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in _ASSET_EXTS:
        raise HTTPException(400, f"Tipo não suportado: {suffix}. Use imagem ou vídeo.")
    assets_dir = job.job_dir() / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    # Sanitize filename: keep original name but strip path separators.
    safe_name = Path(file.filename).name
    # Avoid collisions with random suffix.
    if (assets_dir / safe_name).exists():
        stem = Path(safe_name).stem
        safe_name = f"{stem}_{uuid.uuid4().hex[:6]}{suffix}"
    target = assets_dir / safe_name
    with open(target, "wb") as fh:
        while chunk := await file.read(1 << 20):
            fh.write(chunk)
    kind = "video" if suffix in _VIDEO_EXTS else "image"
    return {"filename": safe_name, "kind": kind, "size": target.stat().st_size}


@app.get("/api/jobs/{job_id}/assets")
async def list_assets(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    assets_dir = job.job_dir() / "assets"
    if not assets_dir.exists():
        return {"assets": []}
    out = []
    for p in sorted(assets_dir.iterdir()):
        if not p.is_file():
            continue
        suffix = p.suffix.lower()
        kind = "video" if suffix in _VIDEO_EXTS else "image" if suffix in _IMAGE_EXTS else None
        if kind is None:
            continue
        out.append({"filename": p.name, "kind": kind, "size": p.stat().st_size})
    return {"assets": out}


@app.delete("/api/jobs/{job_id}/assets/{filename}")
async def delete_asset(job_id: str, filename: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    safe = Path(filename).name
    target = job.job_dir() / "assets" / safe
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "asset not found")
    try:
        target.unlink()
    except OSError as e:
        raise HTTPException(500, f"erro ao apagar: {e}")
    return {"ok": True, "deleted": safe}


@app.get("/api/jobs/{job_id}/assets/{filename}")
async def serve_asset(job_id: str, filename: str,
    user: Optional[UserContext] = Depends(mt_active_user_media)) -> FileResponse:
    job = resolve_job(job_id, user)
    safe = Path(filename).name
    target = job.job_dir() / "assets" / safe
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "asset not found")
    return FileResponse(str(target))


@app.get("/api/jobs/{job_id}/keywords")
async def get_keywords(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    try:
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(500, "words.json inválido")
    words = data.get("words", [])
    return keywords.load_keywords(words, job.job_dir())


@app.post("/api/jobs/{job_id}/keywords/detect")
async def detect_keywords_route(job_id: str,
    user: Optional[UserContext] = Depends(mt_openai_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    try:
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(500, "words.json inválido")
    words = data.get("words", [])
    try:
        result = keywords.detect_keywords(words, job.job_dir(), job.language)
    except Exception as e:
        raise HTTPException(502, f"Falha ao detectar palavras-chave: {e}")
    return result


@app.put("/api/jobs/{job_id}/keywords")
async def save_keywords_route(job_id: str, body: KeywordsUpdate,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    try:
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(500, "words.json inválido")
    n = len(data.get("words", []))
    # Validate indices before persisting.
    clean = sorted({i for i in body.indices if isinstance(i, int) and 0 <= i < n})
    words = data.get("words", [])
    return keywords.save_manual(job.job_dir(), clean, words, body.effects)


@app.post("/api/jobs/{job_id}/enrich")
async def enrich_job(job_id: str, body: EnrichRequest, request: Request,
    user: Optional[UserContext] = Depends(mt_openai_user)) -> dict:
    _rate_limit_request("enrich", 10, request, user.user_id if user else None)
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    try:
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(500, "words.json inválido")
    words = data.get("words", [])
    if not words:
        raise HTTPException(400, "transcrição vazia")
    lang = job.language if job.language and job.language != "auto" else "auto"
    try:
        result = await asyncio.to_thread(
            enrich.enrich_words,
            words, job.job_dir(), lang,
            punctuation=body.punctuation,
            emojis=body.emojis,
        )
    except Exception as e:
        raise HTTPException(502, str(e)) from e
    from timing import trim_word_ends
    data["words"] = trim_word_ends(result["words"])
    job.words_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return {
        "ok": True,
        "changed": result["changed"],
        "words": data["words"],
        "punctuation": body.punctuation,
        "emojis": body.emojis,
    }


@app.post("/api/jobs")
async def upload_job(
    request: Request,
    user: Optional[UserContext] = Depends(mt_openai_user),
    file: UploadFile = File(...),
    language: str = Form("auto"),
    mode: str = Form("legendas"),
) -> dict:
    _rate_limit_request("upload", 3, request, user.user_id if user else None)
    if not file.filename:
        raise HTTPException(400, "filename is required")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}:
        raise HTTPException(400, f"Formato não suportado: {suffix}")
    job_mode = (mode or "legendas").strip().lower()
    if job_mode not in ("legendas", "cortes"):
        job_mode = "legendas"
    job_id = uuid.uuid4().hex[:12]
    uid = user.user_id if user else None
    job = create_job(job_id, file.filename, mode=job_mode, user_id=uid)
    job.language = (language or "auto").strip().lower()
    if is_multi_tenant() and uid:
        try:
            from db_jobs import register_job

            register_job(job_id, uid, file.filename, job_mode)
        except Exception as exc:
            logging.getLogger("legendas").warning("register_job failed: %s", exc)
    total_bytes = 0
    # Enforce max upload size (2 GB) to prevent disk exhaustion.
    MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
    try:
        with open(job.video_path, "wb") as fh:
            while chunk := await file.read(1 << 20):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Arquivo excede o limite de 2 GB.")
                fh.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Falha ao salvar vídeo: {exc}") from exc

    # Return immediately after the file is saved — probe/extract/transcribe run in
    # background so Traefik/nginx never 502 while ffprobe runs on large files.
    job.update(Stage.QUEUED, 0.0, "Upload concluído — processando...")
    asyncio.create_task(_process_upload(job))
    return job.to_dict()


async def _process_upload(job: Job) -> None:
    """Background: validate video, extract audio, then auto-transcribe."""
    with user_api_context(job.user_id):
        if job.video_path.suffix.lower() not in {".mp4", ".webm"}:
            job.update(Stage.QUEUED, 0.05, "Convertendo vídeo para MP4 (Compatibilidade Web)...")
            try:
                target_path = job.video_path.with_suffix(".mp4")
                proc = await asyncio.create_subprocess_exec(
                    ffmpeg_bin(), "-y", "-i", str(job.video_path),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                    "-c:a", "aac", "-movflags", "+faststart",
                    str(target_path),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await proc.wait()
                if proc.returncode == 0 and target_path.exists():
                    job.video_path.unlink(missing_ok=True)
                    job.video_path = target_path
                    import jobs as _jobs
                    _jobs.save_meta(job.job_dir(), filename=target_path.name)
            except Exception as e:
                logging.getLogger("legendas").warning("Transcode failed for %s: %s", job.id, e)

        job.update(Stage.QUEUED, 0.1, "Validando vídeo...")
        try:
            info = await asyncio.to_thread(probe_video, job.video_path)
            job.width, job.height, job.fps, job.duration = (
                info["width"], info["height"], info["fps"], info["duration"]
            )
        except Exception as e:
            job.update(Stage.ERROR, 0.0, "Não consegui ler o vídeo enviado.")
            logging.getLogger("legendas").warning("probe failed for %s: %s", job.id, e)
            return

        if not info.get("has_audio", True):
            job.update(Stage.ERROR, 0.0, "O vídeo não tem faixa de áudio.")
            return

        job.update(Stage.EXTRACTING_AUDIO, 0.0, "Extraindo áudio")
        try:
            await asyncio.to_thread(extract_audio, job.video_path, job.audio_path)
        except Exception as e:
            job.update(Stage.ERROR, 0.0, f"Falha ao extrair áudio: {e}")
            return
        job.update(Stage.AUDIO_READY, 1.0, "Áudio pronto")
        await _run_transcribe(job)


@app.get("/api/jobs")
async def list_jobs(user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    uid = user.user_id if user else None
    return {"jobs": [j.to_dict() for j in jobs.list_jobs(uid)]}


@app.get("/api/jobs/{job_id}")
async def job_detail(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    return job.to_dict()


@app.delete("/api/jobs/{job_id}")
async def delete_job_route(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    removed = jobs.delete_job(job.id)
    if not removed:
        raise HTTPException(404, "job not found")
    return {"ok": True, "deleted": job_id}


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user_media)) -> StreamingResponse:
    job = resolve_job(job_id, user)
    return StreamingResponse(event_stream(job), media_type="text/event-stream")


@app.post("/api/jobs/{job_id}/transcribe")
async def transcribe_job(job_id: str, request: Request,
    user: Optional[UserContext] = Depends(mt_openai_user)) -> dict:
    _rate_limit_request("transcribe", 10, request, user.user_id if user else None)
    job = resolve_job(job_id, user)
    if job.stage == Stage.TRANSCRIBING:
        raise HTTPException(409, "transcription already running")
    # Allow re-transcribe if previous run returned empty words
    job.update(Stage.TRANSCRIBING, 0.0, "Iniciando transcrição")
    asyncio.create_task(_run_transcribe(job))
    return {"ok": True, "stage": job.stage.value}


async def _run_transcribe(job: Job) -> None:
    with user_api_context(job.user_id):
        try:
            def on_progress(p: float, msg: str) -> None:
                job.update(Stage.TRANSCRIBING, p, msg)

            from transcribe import OPENAI_MAX_BYTES

            def ensure_audio() -> None:
                mp3 = job.job_dir() / "audio.mp3"
                if job.video_path and job.video_path.exists():
                    cur = job.audio_path
                    if (
                        cur is None
                        or not cur.exists()
                        or cur.suffix.lower() == ".wav"
                        or cur.stat().st_size > OPENAI_MAX_BYTES
                    ):
                        job.audio_path = mp3
                        extract_audio(job.video_path, mp3)

            await asyncio.to_thread(ensure_audio)

            lang = job.language if job.language and job.language != "auto" else None

            def work() -> None:
                transcribe(
                    job.audio_path, job.words_path,
                    duration=job.duration, on_progress=on_progress,
                    language=lang,
                    width=job.width, height=job.height, fps=job.fps,
                )

            await asyncio.to_thread(work)

            from timing import trim_word_ends

            def trim_only() -> None:
                data = json.loads(job.words_path.read_text(encoding="utf-8"))
                data["words"] = trim_word_ends(data.get("words", []))
                job.words_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            await asyncio.to_thread(trim_only)
            job.update(Stage.TRANSCRIBED, 1.0, "Transcrição concluída")
            asyncio.create_task(_apply_punctuation_background(job))
        except Exception as e:
            job.update(Stage.ERROR, 0.0, f"transcribe falhou: {e}")


async def _apply_punctuation_background(job: Job) -> None:
    """Best-effort GPT punctuation — does not block the editor."""
    from timing import trim_word_ends

    with user_api_context(job.user_id):
        try:
            def work() -> None:
                data = json.loads(job.words_path.read_text(encoding="utf-8"))
                words = data.get("words", [])
                lang = job.language if job.language != "auto" else "auto"
                try:
                    words = enrich.apply_punctuation_auto(words, job.job_dir(), lang)
                except Exception as exc:
                    import logging
                    logging.getLogger("legendas").warning("punctuation failed: %s", exc)
                data["words"] = trim_word_ends(words)
                job.words_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            await asyncio.to_thread(work)
            job.update(Stage.TRANSCRIBED, 1.0, "Transcrição concluída (com pontuação)")
        except Exception:
            pass


@app.get("/api/jobs/{job_id}/words")
async def get_words(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(404, "words.json not ready")
    return json.loads(job.words_path.read_text(encoding="utf-8"))


@app.put("/api/jobs/{job_id}/words")
async def update_words(job_id: str, body: WordsUpdate,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    from timing import trim_word_ends
    payload = {
        "duration": job.duration,
        "fps": job.fps,
        "width": job.width,
        "height": job.height,
        "words": trim_word_ends(body.words),
    }
    job.words_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "count": len(payload["words"])}


@app.post("/api/jobs/{job_id}/render")
async def render_job(job_id: str, body: RenderRequest, request: Request,
    user: Optional[UserContext] = Depends(mt_export_user)) -> dict:
    _rate_limit_request("render", 10, request, user.user_id if user else None)
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    if job.stage == Stage.RENDERING or job_id in _video_render_running:
        raise HTTPException(409, "render already running")
    _video_render_running.add(job_id)
    asyncio.create_task(_run_render(job, body))
    return {"ok": True, "stage": job.stage.value}


async def _run_render(job: Job, body: RenderRequest) -> None:
    with user_api_context(job.user_id):
        try:
            cfg = apply_preset(body.preset, body.custom)
            if body.pos_x is not None:
                cfg.pos_x = body.pos_x
            if body.pos_y is not None:
                cfg.pos_y = body.pos_y

            tpl = get_template(body.template)

            overlay_path: Path | None = None
            if tpl:
                if tpl.needs_overlay and not body.overlay_asset:
                    raise RuntimeError("Este template exige uma mídia (imagem/vídeo) upada.")
                if body.overlay_asset:
                    candidate = job.job_dir() / "assets" / Path(body.overlay_asset).name
                    if not candidate.exists():
                        raise RuntimeError(f"Mídia não encontrada: {body.overlay_asset}")
                    overlay_path = candidate

            job.update(Stage.GENERATING_ASS, 0.0, "Gerando legendas ASS")
            data = json.loads(job.words_path.read_text(encoding="utf-8"))
            from timing import trim_word_ends
            data["words"] = trim_word_ends(data.get("words", []))
            if tpl:
                data["width"] = tpl.width
                data["height"] = tpl.height
                if body.pos_y is None:
                    cfg.pos_y = float(tpl.subtitle_safe_y)
                if body.pos_x is None and tpl.subtitle_safe_x is not None:
                    cfg.pos_x = float(tpl.subtitle_safe_x)
            else:
                from media import probe_video
                info = probe_video(job.video_path)
                data["width"] = info["width"]
                data["height"] = info["height"]
            data["fps"] = job.fps

            highlight_phrases: list[dict] = []
            kw_indices: list[int] | None = None
            if body.highlight_enabled and body.keywords:
                kw_indices = body.keywords
                highlight_phrases = keywords.group_highlight_phrases(
                    data.get("words", []), body.keywords,
                )

            pause_s = getattr(cfg, "pause_threshold_s", 0.45) or 0.45

            await asyncio.to_thread(
                generate_ass, data, cfg, body.words_per_line, job.ass_path,
                kw_indices,
                body.highlight_enabled,
                highlight_phrases if body.highlight_enabled else None,
                pause_s,
            )
            job.update(Stage.GENERATING_ASS, 1.0, "ASS pronto")

            def on_progress(p: float, msg: str) -> None:
                job.update(Stage.RENDERING, p, msg)

            if tpl:
                import compose
                extras = _compose_extras_from_render(body, job.job_dir())
                def work() -> None:
                    compose.render_compose(
                        job.video_path, overlay_path, job.ass_path, job.output_path,
                        tpl, highlight_phrases if body.highlight_enabled else None,
                        body.resolution,
                        duration=job.duration, on_progress=on_progress,
                        video_pos=(body.video_pos_x, body.video_pos_y),
                        extras=extras,
                        job_dir=job.job_dir(),
                    )
            else:
                import compose
                extras = _compose_extras_from_render(body, job.job_dir())
                def work() -> None:
                    render_video(
                        job.video_path, job.ass_path, job.output_path,
                        duration=job.duration, on_progress=on_progress,
                        highlight_phrases=highlight_phrases if body.highlight_enabled else None,
                        extras=extras,
                        canvas_w=data["width"],
                        canvas_h=data["height"],
                    )

            job.update(Stage.RENDERING, 0.0, "Aguardando fila de renderização...")
            async with _render_slots:
                job.update(Stage.RENDERING, 0.0, "Renderizando vídeo")
                await asyncio.to_thread(work)
            job.update(Stage.DONE, 1.0, "Pronto")
            try:
                if job.audio_path and job.audio_path.exists():
                    job.audio_path.unlink()
            except OSError:
                pass
        except Exception as e:
            job.update(Stage.ERROR, 0.0, f"render falhou: {e}")
        finally:
            _video_render_running.discard(job.id)


@app.get("/api/jobs/{job_id}/output.mp4")
async def download_output(job_id: str,
    user: Optional[UserContext] = Depends(mt_export_user_media)) -> FileResponse:
    job = resolve_job(job_id, user)
    if not job.output_path or not job.output_path.exists():
        raise HTTPException(404, "output not ready")
    return FileResponse(
        job.output_path, media_type="video/mp4",
        filename=f"legendado_{job.filename}",
    )


@app.get("/api/jobs/{job_id}/video")
async def download_input(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user_media)) -> FileResponse:
    job = resolve_job(job_id, user)
    if not job.video_path or not job.video_path.exists():
        raise HTTPException(404, "video not found")
    return FileResponse(job.video_path, media_type="video/mp4")


# ---------- clips (Cortes mode) ----------

@app.post("/api/jobs/{job_id}/clips/detect")
async def detect_clips_route(job_id: str, request: Request,
    body: DetectClipsRequest | None = None,
    user: Optional[UserContext] = Depends(mt_openai_user)) -> dict:
    _rate_limit_request("clip-detect", 5, request, user.user_id if user else None)
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    if job_id in _clip_detect_running:
        return {"ok": True, "detecting": True}
    focuses = list(body.focuses) if body and body.focuses else []
    asyncio.create_task(_run_clip_detect(job, focuses))
    return {"ok": True, "detecting": True}


async def _run_clip_detect(job: Job, focuses: list[str] | None = None) -> None:
    with user_api_context(job.user_id):
        job_id = job.id
        if job_id in _clip_detect_running:
            return
        _clip_detect_running.add(job_id)
        try:
            data = json.loads(job.words_path.read_text(encoding="utf-8"))
            words = data.get("words", [])
            lang = job.language if job.language and job.language != "auto" else "auto"
            clips.mark_detecting(job.job_dir())
            job.update(message="Detectando cortes com IA (vídeos longos podem levar 5–15 min)...")
            async with _clip_detect_slots:
                result = await asyncio.to_thread(
                    clips.detect_clips, words, job.job_dir(),
                    duration=job.duration, language=lang, force=True, focuses=focuses,
                )
            n = len(result.get("clips") or [])
            job.update(message=f"{n} cortes encontrados" if n else "Nenhum corte encontrado")
        except Exception as e:
            clips.mark_detect_error(job.job_dir(), str(e))
            job.update(message=f"Falha ao detectar cortes: {e}")
        finally:
            _clip_detect_running.discard(job_id)
            clips.clear_detecting(job.job_dir())


@app.get("/api/jobs/{job_id}/clips")
async def get_clips_route(job_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    data = clips.load_clips(job.job_dir())
    detecting = job_id in _clip_detect_running
    if not data:
        return {"clips": [], "manual": False, "detecting": detecting, "detect_error": None}
    if not detecting and data.get("detecting"):
        if not (data.get("clips")):
            data = dict(data)
            data["detect_error"] = (
                "Detecção interrompida (servidor reiniciou?). Clique em Detectar de novo."
            )
            clips.save_clips(job.job_dir(), data)
        else:
            clips.clear_detecting(job.job_dir())
        data = clips.load_clips(job.job_dir()) or data
    data["detecting"] = detecting
    data.setdefault("detect_error", None)
    return data


@app.put("/api/jobs/{job_id}/clips")
async def save_clips_route(job_id: str, body: ClipsUpdate,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    return clips.update_clips(job.job_dir(), body.clips, manual=True)


@app.patch("/api/jobs/{job_id}/clips/settings")
async def patch_clips_settings(job_id: str, body: ClipsSettingsUpdate,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    settings = body.model_dump(exclude_none=True)
    if not settings:
        raise HTTPException(400, "nenhuma configuração enviada")
    return clips.update_settings(job.job_dir(), settings)


@app.post("/api/jobs/{job_id}/clips/sync-editing")
async def sync_clips_editing_route(job_id: str, body: SyncEditingRequest,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcreva o vídeo primeiro")
    data = json.loads(job.words_path.read_text(encoding="utf-8"))
    words = data.get("words", [])
    lang = job.language if job.language and job.language != "auto" else "auto"
    try:
        result = await asyncio.to_thread(
            clips.sync_editing_to_all_clips,
            job.job_dir(),
            body.source_clip_id,
            words,
            language=lang,
        )
        return {"ok": True, **result}
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"Falha ao sincronizar: {e}") from e


@app.get("/api/jobs/{job_id}/clips/{clip_id}/words")
async def get_clip_words_route(job_id: str, clip_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    clip = clips.get_clip(job.job_dir(), clip_id)
    if not clip:
        raise HTTPException(404, "clip not found")
    override = clips.load_clip_words(job.job_dir(), clip_id)
    if override:
        return {"words": override, "source": "override"}
    data = json.loads(job.words_path.read_text(encoding="utf-8"))
    global_words = data.get("words", [])
    sliced = clips.words_for_render(job.job_dir(), global_words, clip)
    return {"words": sliced, "source": "slice"}


@app.put("/api/jobs/{job_id}/clips/{clip_id}/words")
async def save_clip_words_route(job_id: str, clip_id: str, body: ClipWordsUpdate,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    clip = clips.get_clip(job.job_dir(), clip_id)
    if not clip:
        raise HTTPException(404, "clip not found")
    saved = clips.save_clip_words(job.job_dir(), clip_id, body.words)
    return {"words": saved, "ok": True}


@app.get("/api/jobs/{job_id}/clips/{clip_id}/keywords")
async def get_clip_keywords_route(job_id: str, clip_id: str,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    clip = clips.get_clip(job.job_dir(), clip_id)
    if not clip:
        raise HTTPException(404, "clip not found")
    global_words = json.loads(job.words_path.read_text(encoding="utf-8")).get("words", [])
    sliced = clips.words_for_render(job.job_dir(), global_words, clip)
    return clips.load_clip_keywords(job.job_dir(), clip_id, sliced)


@app.post("/api/jobs/{job_id}/clips/{clip_id}/keywords/detect")
async def detect_clip_keywords_route(job_id: str, clip_id: str,
    user: Optional[UserContext] = Depends(mt_openai_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    clip = clips.get_clip(job.job_dir(), clip_id)
    if not clip:
        raise HTTPException(404, "clip not found")
    global_words = json.loads(job.words_path.read_text(encoding="utf-8")).get("words", [])
    sliced = clips.words_for_render(job.job_dir(), global_words, clip)
    lang = job.language if job.language and job.language != "auto" else "auto"
    try:
        return clips.detect_clip_keywords(
            sliced, job.job_dir(), clip_id, lang, force=True,
        )
    except Exception as e:
        raise HTTPException(502, f"Falha ao detectar palavras-chave: {e}")


@app.put("/api/jobs/{job_id}/clips/{clip_id}/keywords")
async def save_clip_keywords_route(
    job_id: str, clip_id: str, body: ClipKeywordsUpdate,
    user: Optional[UserContext] = Depends(mt_active_user)) -> dict:
    job = resolve_job(job_id, user)
    clip = clips.get_clip(job.job_dir(), clip_id)
    if not clip:
        raise HTTPException(404, "clip not found")
    global_words = json.loads(job.words_path.read_text(encoding="utf-8")).get("words", [])
    sliced = clips.words_for_render(job.job_dir(), global_words, clip)
    n = len(sliced)
    clean = sorted({i for i in body.indices if isinstance(i, int) and 0 <= i < n})
    return clips.save_clip_keywords(
        job.job_dir(), clip_id, clean, sliced, body.effects,
    )


@app.post("/api/jobs/{job_id}/clips/{clip_id}/render")
async def render_single_clip_route(
    job_id: str, clip_id: str, body: SingleClipRenderRequest,
    user: Optional[UserContext] = Depends(mt_export_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    _recover_stale_render_state(job)
    lock_key = _clip_render_key(job_id, clip_id)
    batch_key = _batch_render_key(job_id)
    if lock_key in _clip_render_running:
        raise HTTPException(409, "Este corte já está sendo gerado")
    if batch_key in _clip_render_running:
        raise HTTPException(409, "Exportação em lote em andamento — aguarde")
    clip = clips.get_clip(job.job_dir(), clip_id)
    if not clip:
        raise HTTPException(404, "clip not found")
    opts = _render_opts_from_request(body, job.job_dir())
    _clip_render_running.add(lock_key)
    asyncio.create_task(_run_single_clip_render(job, clip_id, opts, lock_key))
    return {"ok": True, "clip_id": clip_id}


async def _run_single_clip_render(job: Job, clip_id: str, opts: dict, lock_key: str) -> None:
    try:
        clip = clips.get_clip(job.job_dir(), clip_id)
        if not clip:
            return
        job.update(message="Aguardando fila de renderização...")
        async with _render_slots:
            await asyncio.to_thread(_sync_render_one_clip, job, clip, opts)
    finally:
        _clip_render_running.discard(lock_key)


@app.post("/api/jobs/{job_id}/clips/render")
async def render_clips_route(job_id: str, body: ClipsRenderRequest,
    user: Optional[UserContext] = Depends(mt_export_user)) -> dict:
    job = resolve_job(job_id, user)
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    _recover_stale_render_state(job)
    batch_key = _batch_render_key(job_id)
    if batch_key in _clip_render_running:
        raise HTTPException(409, "Exportação em lote já em andamento")
    if _job_has_active_clip_render(job_id):
        raise HTTPException(409, "Aguarde o corte atual terminar de gerar")
    if not body.clip_ids:
        raise HTTPException(400, "selecione ao menos um corte")
    _clip_render_running.add(batch_key)
    asyncio.create_task(_run_clips_render(job, body, batch_key))
    return {"ok": True, "stage": job.stage.value}


async def _run_clips_render(job: Job, body: ClipsRenderRequest, batch_key: str) -> None:
    try:
        opts = _render_opts_from_request(body, job.job_dir())
        clips_data = clips.load_clips(job.job_dir()) or {"clips": []}
        clip_map = {c["id"]: c for c in clips_data.get("clips") or []}
        selected = [clip_map[cid] for cid in body.clip_ids if cid in clip_map]
        if not selected:
            raise RuntimeError("Nenhum corte válido selecionado")

        total = len(selected)
        for i, clip in enumerate(selected):
            job.update(
                Stage.GENERATING_ASS,
                i / total,
                f"Gerando legenda do corte {i + 1}/{total}",
            )

            def on_progress(p: float, msg: str, _i=i) -> None:
                overall = (_i + p) / total
                job.update(Stage.RENDERING, overall, msg)

            async with _render_slots:
                await asyncio.to_thread(_sync_render_one_clip, job, clip, opts, on_progress)

        job.update(Stage.TRANSCRIBED, 1.0, f"{total} corte(s) prontos")
    except Exception as e:
        job.update(Stage.ERROR, 0.0, f"render de cortes falhou: {e}")
    finally:
        _clip_render_running.discard(batch_key)


@app.get("/api/jobs/{job_id}/clips/{clip_id}/output")
async def download_clip_output(job_id: str, clip_id: str,
    user: Optional[UserContext] = Depends(mt_export_user_media)) -> FileResponse:
    job = resolve_job(job_id, user)
    safe_id = Path(clip_id).name
    out = clips.clip_output_path(job.job_dir(), safe_id)
    if not out.exists():
        raise HTTPException(404, "clip output not ready")
    clip = clips.get_clip(job.job_dir(), safe_id)
    title = (clip or {}).get("title", safe_id)
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)[:40]
    return FileResponse(out, media_type="video/mp4", filename=f"corte_{safe_title}.mp4")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
