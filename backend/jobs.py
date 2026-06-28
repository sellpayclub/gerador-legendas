"""Job state management with in-memory store and SSE fan-out."""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import AsyncIterator, Optional

ROOT = Path(__file__).resolve().parent.parent / "data" / "jobs"


class Stage(str, Enum):
    QUEUED = "queued"
    EXTRACTING_AUDIO = "extracting_audio"
    AUDIO_READY = "audio_ready"
    TRANSCRIBING = "transcribing"
    TRANSCRIBED = "transcribed"
    GENERATING_ASS = "generating_ass"
    RENDERING = "rendering"
    DONE = "done"
    ERROR = "error"


@dataclass
class Job:
    id: str
    created_at: float = field(default_factory=time.time)
    stage: Stage = Stage.QUEUED
    progress: float = 0.0  # 0..1 within current stage
    message: str = ""
    video_path: Optional[Path] = None
    audio_path: Optional[Path] = None
    words_path: Optional[Path] = None
    ass_path: Optional[Path] = None
    output_path: Optional[Path] = None
    width: int = 1920
    height: int = 1080
    fps: float = 30.0
    duration: float = 0.0
    filename: str = ""
    language: str = "auto"
    # SSE subscribers
    _subs: list[asyncio.Queue] = field(default_factory=list)
    _loop: Optional[asyncio.AbstractEventLoop] = None

    def job_dir(self) -> Path:
        d = ROOT / self.id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "stage": self.stage.value,
            "progress": self.progress,
            "message": self.message,
            "filename": self.filename,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "duration": self.duration,
            "has_words": self.words_path is not None and self.words_path.exists(),
            "has_output": self.output_path is not None and self.output_path.exists(),
        }

    def update(self, stage: Optional[Stage] = None, progress: Optional[float] = None,
               message: Optional[str] = None) -> None:
        if stage is not None:
            self.stage = stage
        if progress is not None:
            self.progress = max(0.0, min(1.0, progress))
        if message is not None:
            self.message = message
        _broadcast(self)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subs.append(q)
        try:
            q.put_nowait(json.dumps(self.to_dict()))
        except asyncio.QueueFull:
            pass
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        if q in self._subs:
            self._subs.remove(q)


_STORE: dict[str, Job] = {}


def get_job(job_id: str) -> Optional[Job]:
    return _STORE.get(job_id)


def create_job(job_id: str, filename: str) -> Job:
    job = Job(id=job_id, filename=filename)
    try:
        job._loop = asyncio.get_running_loop()
    except RuntimeError:
        job._loop = None
    d = job.job_dir()
    job.video_path = d / f"input{Path(filename).suffix.lower() or '.mp4'}"
    job.audio_path = d / "audio.wav"
    job.words_path = d / "words.json"
    job.ass_path = d / "captions.ass"
    job.output_path = d / "output.mp4"
    _STORE[job_id] = job
    return job


def list_jobs() -> list[Job]:
    return sorted(_STORE.values(), key=lambda j: -j.created_at)


def rehydrate_jobs() -> None:
    """Reload jobs from disk so restarts don't lose the job list."""
    if not ROOT.exists():
        return
    from media import probe_video

    for d in ROOT.iterdir():
        if not d.is_dir():
            continue
        job_id = d.name
        if job_id in _STORE:
            continue
        inputs = sorted(d.glob("input.*"))
        if not inputs:
            continue
        video = inputs[0]
        job = Job(id=job_id, filename=video.name)
        job.created_at = d.stat().st_mtime
        job.video_path = video
        job.audio_path = d / "audio.wav"
        job.words_path = d / "words.json"
        job.ass_path = d / "captions.ass"
        job.output_path = d / "output.mp4"
        try:
            info = probe_video(video)
            job.width = info["width"]
            job.height = info["height"]
            job.fps = info["fps"]
            job.duration = info["duration"]
        except Exception:
            pass
        if job.output_path.exists():
            job.stage = Stage.DONE
            job.progress = 1.0
            job.message = "Pronto"
        elif job.words_path.exists():
            job.stage = Stage.TRANSCRIBED
            job.progress = 1.0
            job.message = "Transcrição concluída"
        elif job.audio_path.exists():
            job.stage = Stage.AUDIO_READY
            job.message = "Áudio pronto"
        else:
            job.stage = Stage.QUEUED
        _STORE[job_id] = job


def _broadcast(job: Job) -> None:
    payload = json.dumps(job.to_dict())
    loop = job._loop
    if loop is None:
        # No event loop (e.g. called from non-async context at startup).
        # Best-effort direct put.
        for q in list(job._subs):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                job.unsubscribe(q)
        return
    # Schedule the put on the event loop thread to be safe from any thread
    for q in list(job._subs):
        try:
            loop.call_soon_threadsafe(_safe_put, q, payload, job)
        except RuntimeError:
            # loop closed
            job.unsubscribe(q)


def _safe_put(q: asyncio.Queue, payload: str, job: Job) -> None:
    try:
        q.put_nowait(payload)
    except asyncio.QueueFull:
        job.unsubscribe(q)


async def event_stream(job: Job) -> AsyncIterator[str]:
    q = job.subscribe()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
                yield f"data: {msg}\n\n"
                if job.stage in (Stage.DONE, Stage.ERROR):
                    yield f"data: {json.dumps(job.to_dict())}\n\n"
                    break
            except asyncio.TimeoutError:
                yield ": ping\n\n"
    finally:
        job.unsubscribe(q)


def _dir_last_activity(d: Path) -> float:
    """Most recent mtime among a job dir and its files (dir mtime alone can be
    stale when only file contents change)."""
    latest = d.stat().st_mtime
    for f in d.iterdir():
        try:
            latest = max(latest, f.stat().st_mtime)
        except OSError:
            pass
    return latest


def cleanup_old_jobs(max_age_hours: float = 12.0) -> None:
    """Delete job directories (videos included) older than max_age_hours so the
    VPS doesn't accumulate uploaded/rendered videos."""
    cutoff = time.time() - max_age_hours * 3600
    if not ROOT.exists():
        return
    import shutil
    for d in ROOT.iterdir():
        if d.is_dir() and _dir_last_activity(d) < cutoff:
            shutil.rmtree(d, ignore_errors=True)
            _STORE.pop(d.name, None)
