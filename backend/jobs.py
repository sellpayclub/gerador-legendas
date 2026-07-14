"""Job state management with in-memory store and SSE fan-out."""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import AsyncIterator, Optional

from tenant import is_multi_tenant, job_max_age_hours

ROOT = Path(__file__).resolve().parent.parent / "data" / "jobs"


def _read_meta(job_dir: Path) -> dict:
    meta = job_dir / "meta.json"
    if not meta.exists():
        return {}
    try:
        return json.loads(meta.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _read_clips_meta(job_dir: Path) -> dict:
    p = job_dir / "clips.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_meta(job_dir: Path, **fields) -> None:
    data = _read_meta(job_dir)
    data.update(fields)
    try:
        (job_dir / "meta.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


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
    user_id: Optional[str] = None
    language: str = "auto"
    # SSE subscribers
    _subs: list[asyncio.Queue] = field(default_factory=list)
    _loop: Optional[asyncio.AbstractEventLoop] = None

    def job_dir(self) -> Path:
        d = ROOT / self.id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def to_dict(self) -> dict:
        meta = _read_meta(self.job_dir())
        clips_data = _read_clips_meta(self.job_dir())
        job_dir = self.job_dir()
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
            "mode": meta.get("mode", "legendas"),
            "clips_ready": bool(clips_data.get("clips")),
            "clip_count": len(clips_data.get("clips") or []),
            "created_at": self.created_at,
            "updated_at": _dir_last_activity(job_dir),
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


def create_job(
    job_id: str,
    filename: str,
    *,
    mode: str = "legendas",
    user_id: Optional[str] = None,
) -> Job:
    job = Job(id=job_id, filename=filename, user_id=user_id)
    try:
        job._loop = asyncio.get_running_loop()
    except RuntimeError:
        job._loop = None
    d = job.job_dir()
    job.video_path = d / f"input{Path(filename).suffix.lower() or '.mp4'}"
    job.audio_path = d / "audio.mp3"
    job.words_path = d / "words.json"
    job.ass_path = d / "captions.ass"
    job.output_path = d / "output.mp4"
    try:
        save_meta(
            d,
            filename=filename,
            mode=mode,
            user_id=user_id,
            created_at=job.created_at,
        )
    except Exception:
        pass
    _STORE[job_id] = job
    return job


def list_jobs(user_id: Optional[str] = None) -> list[Job]:
    items = _STORE.values()
    if user_id is not None:
        items = [j for j in items if j.user_id == user_id]
    return sorted(items, key=lambda j: -j.created_at)


def delete_job(job_id: str) -> bool:
    """Remove a job from the store and delete its files on disk.
    Returns True if a directory or store entry was removed."""
    import shutil
    removed = _STORE.pop(job_id, None) is not None
    d = ROOT / job_id
    if d.exists() and d.is_dir():
        # Rename the directory first to prevent it from being rehydrated
        # if rmtree fails to delete some files (e.g. held open by processes).
        deleted_dir = d.with_name(d.name + f".deleted.{int(time.time())}")
        try:
            d.rename(deleted_dir)
            shutil.rmtree(deleted_dir, ignore_errors=True)
        except Exception:
            # Fallback if rename fails
            shutil.rmtree(d, ignore_errors=True)
        removed = True
    if is_multi_tenant():
        try:
            from db_jobs import unregister_job

            unregister_job(job_id)
        except Exception:
            pass
    return removed


def rehydrate_jobs() -> None:
    """Reload jobs from disk so restarts don't lose the job list."""
    if not ROOT.exists():
        return
    from media import probe_video

    for d in ROOT.iterdir():
        if not d.is_dir():
            continue
        job_id = d.name
        # A failed best-effort removal may leave the renamed tombstone behind.
        # Never expose or resume it as if it were a real job after a restart.
        if ".deleted." in job_id:
            continue
        if job_id in _STORE:
            continue
        inputs = sorted(d.glob("input.*"))
        out = d / "output.mp4"
        wj = d / "words.json"
        # Keep a job if it has anything meaningful: the original input, a
        # finished render, or a transcription. (Rendered jobs lose their input
        # because it's deleted to save space — they must NOT be dropped.)
        if not inputs and not out.exists() and not wj.exists():
            continue
        # Recover the original filename from meta.json when the input is gone.
        filename = inputs[0].name if inputs else "video.mp4"
        meta = d / "meta.json"
        if meta.exists():
            try:
                filename = json.loads(meta.read_text(encoding="utf-8")).get("filename", filename)
            except Exception:
                pass
        video = inputs[0] if inputs else None
        meta_data = _read_meta(d)
        job = Job(id=job_id, filename=filename)
        job.user_id = meta_data.get("user_id")
        created = meta_data.get("created_at")
        job.created_at = float(created) if created else d.stat().st_mtime
        job.video_path = video
        job.audio_path = d / "audio.mp3"
        if not job.audio_path.exists() and (d / "audio.wav").exists():
            job.audio_path = d / "audio.wav"
        job.words_path = wj
        job.ass_path = d / "captions.ass"
        job.output_path = out
        probe_target = video if video else (out if out.exists() else None)
        if probe_target is not None:
            try:
                info = probe_video(probe_target)
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


def _job_created_at(job_dir: Path) -> float:
    meta = _read_meta(job_dir)
    raw = meta.get("created_at")
    if raw is not None:
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    return job_dir.stat().st_mtime


def cleanup_old_jobs(max_age_hours: Optional[float] = None) -> None:
    """Delete job directories (videos included) older than max_age_hours so the
    VPS doesn't accumulate uploaded/rendered videos."""
    hours = job_max_age_hours() if max_age_hours is None else max_age_hours
    if not is_multi_tenant() and max_age_hours is None:
        hours = 12.0
    cutoff = time.time() - hours * 3600
    if not ROOT.exists():
        return
    import shutil
    for d in ROOT.iterdir():
        if not d.is_dir():
            continue
        age_ts = _job_created_at(d)
        if age_ts < cutoff:
            shutil.rmtree(d, ignore_errors=True)
            _STORE.pop(d.name, None)
            if is_multi_tenant():
                try:
                    from db_jobs import unregister_job

                    unregister_job(d.name)
                except Exception:
                    pass
