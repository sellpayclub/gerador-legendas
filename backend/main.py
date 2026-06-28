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


# ---------- routes ----------

@app.get("/api/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/api/presets")
async def presets_list() -> dict:
    return list_presets()


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

        job.update(Stage.GENERATING_ASS, 0.0, "Gerando legendas ASS")
        data = json.loads(job.words_path.read_text(encoding="utf-8"))
        # Authoritative dims come from the probed Job, not words.json (which may
        # lack them and would otherwise fall back to a 1920x1080 default).
        data["width"] = job.width
        data["height"] = job.height
        data["fps"] = job.fps
        await asyncio.to_thread(
            generate_ass, data, cfg, body.words_per_line, job.ass_path
        )
        job.update(Stage.GENERATING_ASS, 1.0, "ASS pronto")

        def on_progress(p: float, msg: str) -> None:
            job.update(Stage.RENDERING, p, msg)

        def work() -> None:
            render_video(
                job.video_path, job.ass_path, job.output_path,
                duration=job.duration, on_progress=on_progress,
            )

        job.update(Stage.RENDERING, 0.0, "Renderizando vídeo")
        await asyncio.to_thread(work)
        job.update(Stage.DONE, 1.0, "Pronto")
        # Don't hoard videos: the rendered output.mp4 is all we need to keep for
        # download. Remove the raw upload and the extracted audio right away.
        for p in (job.video_path, job.audio_path):
            try:
                if p and p.exists():
                    p.unlink()
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
