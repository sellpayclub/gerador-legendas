"""FastAPI app: upload, transcribe, edit words, render, SSE events."""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

import jobs
from jobs import Job, Stage, create_job, get_job, event_stream, cleanup_old_jobs, rehydrate_jobs
from media import ensure_ffmpeg, extract_audio, probe_video
from presets import StyleConfig, apply_preset, list_presets
from ass_gen import generate_ass
from render import render_video
from transcribe import transcribe
import templates
from templates import get_template
import keywords

app = FastAPI(title="Legendas Locais")

_origins = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://legendas.clonefyia.com",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    ensure_ffmpeg()
    cleanup_old_jobs()
    rehydrate_jobs()
    asyncio.create_task(_periodic_cleanup())


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
    # Templates & composition (all optional -> backward compatible):
    template: str | None = None        # "reels_split" | "ig_square" | None
    resolution: str = "1080p"          # "480p" | "720p" | "1080p"
    keywords: list[int] | None = None  # word indices to zoom on; None = no zoom
    overlay_asset: str | None = None   # filename uploaded via /assets
    # Video pan/tilt inside the template's video_region (0.0..1.0, 0.5=center):
    video_pos_x: float | None = None
    video_pos_y: float | None = None


class KeywordsUpdate(BaseModel):
    indices: list[int]


# ---------- routes ----------

@app.get("/api/health")
async def health() -> dict:
    return {"ok": True}


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
async def upload_asset(job_id: str, file: UploadFile = File(...)) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
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
async def list_assets(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
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
async def delete_asset(job_id: str, filename: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
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
async def serve_asset(job_id: str, filename: str) -> FileResponse:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    safe = Path(filename).name
    target = job.job_dir() / "assets" / safe
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "asset not found")
    return FileResponse(str(target))


@app.get("/api/jobs/{job_id}/keywords")
async def get_keywords(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
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
async def save_keywords_route(job_id: str, body: KeywordsUpdate) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    try:
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(500, "words.json inválido")
    n = len(data.get("words", []))
    # Validate indices before persisting.
    clean = sorted({i for i in body.indices if isinstance(i, int) and 0 <= i < n})
    return keywords.save_manual(job.job_dir(), clean)


@app.post("/api/jobs")
async def upload_job(
    file: UploadFile = File(...),
    language: str = Form("auto"),
) -> dict:
    if not file.filename:
        raise HTTPException(400, "filename is required")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}:
        raise HTTPException(400, f"Formato não suportado: {suffix}")
    job_id = uuid.uuid4().hex[:12]
    job = create_job(job_id, file.filename)
    job.language = (language or "auto").strip().lower()
    # stream upload to disk in chunks (the actual upload transfer)
    with open(job.video_path, "wb") as fh:
        while chunk := await file.read(1 << 20):
            fh.write(chunk)

    # Probe is fast (reads headers); do it now so we can reject bad files
    # immediately and return real dimensions to the client.
    try:
        info = await asyncio.to_thread(probe_video, job.video_path)
        job.width, job.height, job.fps, job.duration = (
            info["width"], info["height"], info["fps"], info["duration"]
        )
    except Exception as e:
        job.update(Stage.ERROR, 0.0, "Não consegui ler o vídeo enviado.")
        raise HTTPException(400, f"Não consegui ler o vídeo: {e}")

    if not info.get("has_audio", True):
        job.update(Stage.ERROR, 0.0, "O vídeo não tem faixa de áudio.")
        raise HTTPException(400, "O vídeo não tem áudio. Envie um vídeo com som para gerar legendas.")

    # Heavy work (audio extraction + transcription) runs in the background so
    # the HTTP request returns immediately and the gateway never times out (502).
    job.update(Stage.QUEUED, 0.0, "Na fila")
    asyncio.create_task(_process_upload(job))
    return job.to_dict()


async def _process_upload(job: Job) -> None:
    """Background pipeline: extract audio, then auto-transcribe."""
    job.update(Stage.EXTRACTING_AUDIO, 0.0, "Extraindo áudio")
    try:
        await asyncio.to_thread(extract_audio, job.video_path, job.audio_path)
    except Exception as e:
        job.update(Stage.ERROR, 0.0, f"Falha ao extrair áudio: {e}")
        return
    job.update(Stage.AUDIO_READY, 1.0, "Áudio pronto")
    await _run_transcribe(job)


@app.get("/api/jobs")
async def list_jobs() -> dict:
    return {"jobs": [j.to_dict() for j in jobs.list_jobs()]}


@app.get("/api/jobs/{job_id}")
async def job_detail(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job.to_dict()


@app.delete("/api/jobs/{job_id}")
async def delete_job_route(job_id: str) -> dict:
    removed = jobs.delete_job(job_id)
    if not removed:
        raise HTTPException(404, "job not found")
    return {"ok": True, "deleted": job_id}


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return StreamingResponse(event_stream(job), media_type="text/event-stream")


@app.post("/api/jobs/{job_id}/transcribe")
async def transcribe_job(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if job.stage == Stage.TRANSCRIBING:
        raise HTTPException(409, "transcription already running")
    # Allow re-transcribe if previous run returned empty words
    job.update(Stage.TRANSCRIBING, 0.0, "Iniciando transcrição")
    asyncio.create_task(_run_transcribe(job))
    return {"ok": True, "stage": job.stage.value}


async def _run_transcribe(job: Job) -> None:
    try:
        def on_progress(p: float, msg: str) -> None:
            job.update(Stage.TRANSCRIBING, p, msg)

        # "auto" (or empty) -> let Whisper detect the spoken language.
        lang = job.language if job.language and job.language != "auto" else None

        def work() -> None:
            transcribe(
                job.audio_path, job.words_path,
                duration=job.duration, on_progress=on_progress,
                language=lang,
                width=job.width, height=job.height, fps=job.fps,
            )

        await asyncio.to_thread(work)
        # refresh job with words file info
        job.update(Stage.TRANSCRIBED, 1.0, "Transcrição concluída")
    except Exception as e:
        job.update(Stage.ERROR, 0.0, f"transcribe falhou: {e}")


@app.get("/api/jobs/{job_id}/words")
async def get_words(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(404, "words.json not ready")
    return json.loads(job.words_path.read_text(encoding="utf-8"))


@app.put("/api/jobs/{job_id}/words")
async def update_words(job_id: str, body: WordsUpdate) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    payload = {
        "duration": job.duration,
        "fps": job.fps,
        "width": job.width,
        "height": job.height,
        "words": body.words,
    }
    job.words_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "count": len(body.words)}


@app.post("/api/jobs/{job_id}/render")
async def render_job(job_id: str, body: RenderRequest) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if not job.words_path or not job.words_path.exists():
        raise HTTPException(400, "transcribe first")
    if job.stage == Stage.RENDERING:
        raise HTTPException(409, "render already running")
    asyncio.create_task(_run_render(job, body))
    return {"ok": True, "stage": job.stage.value}


async def _run_render(job: Job, body: RenderRequest) -> None:
    try:
        cfg = apply_preset(body.preset, body.custom)
        if body.pos_x is not None:
            cfg.pos_x = body.pos_x
        if body.pos_y is not None:
            cfg.pos_y = body.pos_y

        tpl = get_template(body.template)

        # Validate template requirements early so we don't waste a render.
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
        # When a template is active, the ASS canvas matches the template (e.g.
        # 1080x1920) so subtitle \pos coordinates line up with the composed
        # output. Otherwise we use the probed input dims as before.
        if tpl:
            data["width"] = tpl.width
            data["height"] = tpl.height
            if body.pos_y is None:
                cfg.pos_y = float(tpl.subtitle_safe_y)
        else:
            data["width"] = job.width
            data["height"] = job.height
        data["fps"] = job.fps
        await asyncio.to_thread(
            generate_ass, data, cfg, body.words_per_line, job.ass_path,
            body.keywords,
        )
        job.update(Stage.GENERATING_ASS, 1.0, "ASS pronto")

        def on_progress(p: float, msg: str) -> None:
            job.update(Stage.RENDERING, p, msg)

        if tpl:
            # Import here so Fase 1 stays runnable before compose.py exists.
            import compose
            def work() -> None:
                compose.render_compose(
                    job.video_path, overlay_path, job.ass_path, job.output_path,
                    tpl, body.keywords, body.resolution,
                    duration=job.duration, on_progress=on_progress,
                    video_pos=(body.video_pos_x, body.video_pos_y),
                )
        else:
            def work() -> None:
                render_video(
                    job.video_path, job.ass_path, job.output_path,
                    duration=job.duration, on_progress=on_progress,
                )

        job.update(Stage.RENDERING, 0.0, "Renderizando vídeo")
        await asyncio.to_thread(work)
        job.update(Stage.DONE, 1.0, "Pronto")
        # Keep the input video and audio so the user can re-render with a
        # different template/style/keywords. Disk usage is bounded by
        # cleanup_old_jobs (12h max age). Only the extracted audio is disposable
        # since we can re-extract it from the input if needed.
        try:
            if job.audio_path and job.audio_path.exists():
                job.audio_path.unlink()
        except OSError:
            pass
    except Exception as e:
        job.update(Stage.ERROR, 0.0, f"render falhou: {e}")


@app.get("/api/jobs/{job_id}/output.mp4")
async def download_output(job_id: str) -> FileResponse:
    job = get_job(job_id)
    if not job or not job.output_path or not job.output_path.exists():
        raise HTTPException(404, "output not ready")
    return FileResponse(
        job.output_path, media_type="video/mp4",
        filename=f"legendado_{job.filename}",
    )


@app.get("/api/jobs/{job_id}/video")
async def download_input(job_id: str) -> FileResponse:
    job = get_job(job_id)
    if not job or not job.video_path or not job.video_path.exists():
        raise HTTPException(404, "video not found")
    return FileResponse(job.video_path, media_type="video/mp4")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
