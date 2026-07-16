"""Auto-detect short-form clips (45s–3min insights) from long transcripts."""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from timing import gap_after
from openai_chat import chat_json, completion_token_budget, uses_max_completion_tokens
from app_settings import get_clips_model
from request_context import get_current_user_id, user_api_context

load_dotenv()

FALLBACK_CLIPS_MODEL = "gpt-4o"

MIN_CLIP_S = 45.0
TARGET_MIN_S = 45.0
TARGET_MAX_S = 180.0
HOOK_MIN_S = 3.0
HOOK_MAX_S = 25.0
BODY_MIN_S = 30.0
BODY_MAX_S = 175.0
PAUSE_SNAP_S = 0.45
MAX_CLIPS = 24
MIN_CLIPS_TARGET = 10

# Focos editoriais selecionáveis pelo usuário antes de "Detectar com IA".
# Cada foco injeta uma instrução extra no prompt do GPT para direcionar a seleção.
# "viral" é o comportamento padrão (sem instrução extra) e equivale ao histórico.
FOCUS_LABELS: dict[str, str] = {
    "viral": "Viral",
    "polemico": "Polêmicos",
    "engracado": "Engraçados",
    "valioso": "Conteúdo valioso",
    "inspirador": "Inspirador",
    "choque": "Choque",
}
FOCUS_INSTRUCTIONS: dict[str, str] = {
    "viral": "Priorize ganchos fortes e apelo amplo — estilo Reels/TikTok que bomba.",
    "polemico": "Priorize trechos com opiniões fortes, afirmações controversas, debates e ângulos que geram comentários e discussão.",
    "engracado": "Priorize momentos de humor, punchlines, histórias cômicas e reações engraçadas.",
    "valioso": "Priorize trechos densos em ensinamento, dicas práticas, explicações úteis e takeaways que o viewer salva pra usar depois.",
    "inspirador": "Priorize trechos de superação, motivação, mudança de mindset e frases de impacto emocional.",
    "choque": "Priorize fatos surpreendentes, números chocantes, revelações e afirmações que quebram crenças comuns.",
}
ALLOWED_FOCUSES = set(FOCUS_INSTRUCTIONS.keys())


def _focus_instructions(focuses: list[str] | None) -> str:
    """Bloco injetado no prompt quando o usuário escolhe focos além do padrão viral."""
    if not focuses:
        return ""
    unique = []
    seen: set[str] = set()
    for f in focuses:
        if f and f in FOCUS_INSTRUCTIONS and f not in seen and f != "viral":
            unique.append(f)
            seen.add(f)
    if not unique:
        return ""
    lines = "\n".join(f"- {FOCUS_LABELS[f]}: {FOCUS_INSTRUCTIONS[f]}" for f in unique)
    return (
        "\n\n## Foco editorial desta rodada\n"
        "O usuário pediu cortes destes tipos. Priorize trechos que se encaixem, "
        "sem sacrificar o gancho:\n" + lines + "\n"
    )


def _sanitize_focuses(focuses: list[str] | None) -> list[str]:
    if not focuses:
        return []
    return [f for f in focuses if f in ALLOWED_FOCUSES]
CHUNK_WORDS = 500
SINGLE_PASS_WORDS = 1500
MIN_CLIP_SCORE = 0.62


def _cache_path(job_dir: Path) -> Path:
    return job_dir / "clips.json"


def load_clips(job_dir: Path) -> Optional[dict]:
    p = _cache_path(job_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_clips(job_dir: Path, payload: dict) -> dict:
    payload["ts"] = time.time()
    payload.setdefault("detecting", False)
    payload.setdefault("detect_error", None)
    _cache_path(job_dir).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def mark_detecting(job_dir: Path) -> None:
    prev = load_clips(job_dir) or {}
    save_clips(job_dir, {
        "clips": prev.get("clips") or [],
        "model": prev.get("model", get_clips_model()),
        "manual": prev.get("manual", False),
        "detecting": True,
        "detect_error": None,
    })


def mark_detect_error(job_dir: Path, message: str) -> None:
    prev = load_clips(job_dir) or {}
    save_clips(job_dir, {
        "clips": prev.get("clips") or [],
        "model": prev.get("model", get_clips_model()),
        "manual": prev.get("manual", False),
        "detecting": False,
        "detect_error": message,
    })


def clear_detecting(job_dir: Path) -> None:
    """Clear stale detecting flag (e.g. after server restart mid-job)."""
    prev = load_clips(job_dir)
    if not prev or not prev.get("detecting"):
        return
    prev["detecting"] = False
    save_clips(job_dir, prev)


def clip_count(job_dir: Path) -> int:
    data = load_clips(job_dir)
    if not data:
        return 0
    return len(data.get("clips") or [])


def _clip_target_count(duration: float) -> int:
    scaled = int(duration / 90)
    floor = MIN_CLIPS_TARGET if duration >= 900 else int(duration / 120)
    return min(MAX_CLIPS, max(3, floor, scaled))


def slice_words(words: list[dict], t0: float, t1: float) -> list[dict]:
    """Words inside [t0, t1], timestamps shifted to start at 0."""
    out: list[dict] = []
    for w in words:
        ws = float(w["start"])
        we = float(w["end"])
        if we <= t0 or ws >= t1:
            continue
        out.append({
            "w": w.get("w", ""),
            "start": round(max(0.0, ws - t0), 3),
            "end": round(min(t1 - t0, we - t0), 3),
        })
    return out


def _segment_time_bounds(words: list[dict], i0: int, i1: int) -> tuple[float, float]:
    i0 = max(0, min(i0, len(words) - 1))
    i1 = max(i0, min(i1, len(words) - 1))
    return float(words[i0]["start"]), float(words[i1]["end"])


def clip_source_bounds(clip: dict) -> list[dict]:
    """Source-video time ranges for each segment (hook/body order)."""
    segments = _export_ordered_segments(clip) if clip.get("segments") else None
    if segments:
        return [
            {
                "role": s.get("role", "body"),
                "start_s": float(s["start_s"]),
                "end_s": float(s["end_s"]),
            }
            for s in segments
        ]
    return [{
        "role": "body",
        "start_s": float(clip["start_s"]),
        "end_s": float(clip["end_s"]),
    }]


def merge_segment_words(words: list[dict], segments: list[dict]) -> list[dict]:
    """Merge segment words into a continuous export timeline starting at 0."""
    out: list[dict] = []
    offset = 0.0
    for seg in segments:
        # Times are editable in the UI. They are the source of truth during
        # export; stored word indices describe the original AI suggestion and
        # may no longer match after the user adjusts a cold-open segment.
        src_start = max(0.0, float(seg["start_s"]))
        src_end = max(src_start, float(seg["end_s"]))
        for w in words:
            ws = float(w["start"])
            we = float(w["end"])
            if we <= src_start or ws >= src_end:
                continue
            rel_start = max(0.0, ws - src_start) + offset
            rel_end = min(src_end - src_start, we - src_start) + offset
            out.append({
                "w": w.get("w", ""),
                "start": round(rel_start, 3),
                "end": round(rel_end, 3),
            })
        offset += max(0.1, src_end - src_start)
    return out


def clip_bounds_from_indices(
    words: list[dict],
    i0: int,
    i1: int,
    *,
    title: str = "",
    hook: str = "",
    score: float = 0.0,
    clip_id: str | None = None,
) -> dict:
    i0 = max(0, min(i0, len(words) - 1))
    i1 = max(i0, min(i1, len(words) - 1))
    start_s = float(words[i0]["start"])
    end_s = float(words[i1]["end"])
    text = " ".join((words[i].get("w") or "").strip() for i in range(i0, i1 + 1)).strip()
    return {
        "id": clip_id or f"clip_{uuid.uuid4().hex[:8]}",
        "title": title or f"Corte {i0}–{i1}",
        "hook": hook,
        "score": score,
        "edit_mode": "linear",
        "start_word_idx": i0,
        "end_word_idx": i1,
        "start_s": round(start_s, 3),
        "end_s": round(end_s, 3),
        "duration_s": round(end_s - start_s, 3),
        "preview": text[:120] + ("…" if len(text) > 120 else ""),
        "insight": hook,
        "enabled": True,
        "status": "pending",
    }


def _snap_start_to_pause(words: list[dict], idx: int) -> int:
    idx = max(0, min(idx, len(words) - 1))
    while idx > 0:
        g = gap_after(words, idx - 1)
        if g >= PAUSE_SNAP_S:
            break
        idx -= 1
    return idx


def _snap_end_to_pause(words: list[dict], idx: int) -> int:
    idx = max(0, min(idx, len(words) - 1))
    while idx < len(words) - 1:
        g = gap_after(words, idx)
        if g >= PAUSE_SNAP_S:
            break
        idx += 1
    return idx


def _normalize_segment_indices(words: list[dict], i0: int, i1: int) -> tuple[int, int]:
    i0 = max(0, min(i0, len(words) - 1))
    i1 = max(i0, min(i1, len(words) - 1))
    i0 = _snap_start_to_pause(words, i0)
    i1 = _snap_end_to_pause(words, i1)
    return i0, i1


def _expand_to_min_duration(words: list[dict], i0: int, i1: int, min_s: float) -> tuple[int, int]:
    while i0 > 0 and float(words[i1]["end"]) - float(words[i0]["start"]) < min_s:
        i0 = max(0, _snap_start_to_pause(words, i0) - 1)
        if i0 == 0:
            break
    while i1 < len(words) - 1 and float(words[i1]["end"]) - float(words[i0]["start"]) < min_s:
        i1 = min(len(words) - 1, _snap_end_to_pause(words, i1) + 1)
        if i1 >= len(words) - 1:
            break
    return i0, i1


def _shrink_to_max_duration(words: list[dict], i0: int, i1: int, max_s: float) -> tuple[int, int]:
    while i1 > i0 and float(words[i1]["end"]) - float(words[i0]["start"]) > max_s:
        i1 -= 1
    return i0, i1


def _build_segments_from_raw(words: list[dict], raw: dict) -> list[dict] | None:
    """Build normalized segment list from GPT response."""
    raw_segments = raw.get("segments")
    edit_mode = str(raw.get("edit_mode") or "").strip()

    if raw_segments and isinstance(raw_segments, list) and len(raw_segments) >= 1:
        built: list[dict] = []
        for seg in raw_segments:
            role = str(seg.get("role") or "body").strip().lower()
            if role not in ("hook", "body"):
                role = "body"
            try:
                i0 = int(seg.get("start_word_idx", seg.get("start_idx", 0)))
                i1 = int(seg.get("end_word_idx", seg.get("end_idx", i0)))
            except (TypeError, ValueError):
                continue
            i0, i1 = _normalize_segment_indices(words, i0, i1)
            src_start, src_end = _segment_time_bounds(words, i0, i1)
            built.append({
                "role": role,
                "start_word_idx": i0,
                "end_word_idx": i1,
                "start_s": round(src_start, 3),
                "end_s": round(src_end, 3),
                "duration_s": round(src_end - src_start, 3),
            })
        if not built:
            return None
        has_hook = any(s["role"] == "hook" for s in built)
        has_body = any(s["role"] == "body" for s in built)
        if has_hook and has_body:
            hook_segs = [s for s in built if s["role"] == "hook"]
            body_segs = [s for s in built if s["role"] == "body"]
            return hook_segs[:1] + body_segs[:1]
        if len(built) == 1:
            return built
        return built

    if edit_mode == "linear" or raw.get("start_word_idx") is not None:
        try:
            i0 = int(raw.get("start_word_idx", raw.get("start_idx", 0)))
            i1 = int(raw.get("end_word_idx", raw.get("end_idx", i0)))
        except (TypeError, ValueError):
            return None
        i0, i1 = _normalize_segment_indices(words, i0, i1)
        src_start, src_end = _segment_time_bounds(words, i0, i1)
        return [{
            "role": "body",
            "start_word_idx": i0,
            "end_word_idx": i1,
            "start_s": round(src_start, 3),
            "end_s": round(src_end, 3),
            "duration_s": round(src_end - src_start, 3),
        }]
    return None


def _body_indices_from_clip(clip: dict) -> tuple[int, int]:
    segments = clip.get("segments") or []
    body = next((s for s in segments if s.get("role") == "body"), None)
    if body:
        return int(body["start_word_idx"]), int(body["end_word_idx"])
    return int(clip.get("start_word_idx", 0)), int(clip.get("end_word_idx", 0))


def _segments_overlap(a: tuple[int, int], b: tuple[int, int], tolerance: float = 0.05) -> bool:
    a0, a1 = a
    b0, b1 = b
    span_a = max(1, a1 - a0)
    span_b = max(1, b1 - b0)
    overlap_start = max(a0, b0)
    overlap_end = min(a1, b1)
    if overlap_end < overlap_start:
        return False
    overlap = overlap_end - overlap_start + 1
    return overlap / span_a >= (1.0 - tolerance) and overlap / span_b >= (1.0 - tolerance)


def _dedupe_similar_clips(clips: list[dict]) -> list[dict]:
    if not clips:
        return []
    sorted_clips = sorted(clips, key=lambda c: -float(c.get("score") or 0))
    kept: list[dict] = []
    for c in sorted_clips:
        body_idx = _body_indices_from_clip(c)
        duplicate = False
        for k in kept:
            k_body = _body_indices_from_clip(k)
            if _segments_overlap(body_idx, k_body):
                hook_a = (c.get("hook_text") or c.get("hook") or c.get("title") or "").strip().lower()
                hook_b = (k.get("hook_text") or k.get("hook") or k.get("title") or "").strip().lower()
                if hook_a == hook_b or (c.get("title") or "").strip().lower() == (k.get("title") or "").strip().lower():
                    duplicate = True
                    break
        if not duplicate:
            kept.append(c)
    def _sort_key(c: dict) -> float:
        segs = c.get("segments") or []
        body = next((s for s in segs if s.get("role") == "body"), segs[0] if segs else None)
        if body:
            return float(body.get("start_s", c.get("start_s", 0)))
        return float(c.get("start_s", 0))

    kept.sort(key=_sort_key)
    return kept[:MAX_CLIPS]


def _finalize_clip_from_segments(
    words: list[dict],
    segments: list[dict],
    *,
    title: str,
    hook_text: str,
    insight: str,
    score: float,
    edit_mode: str,
    coherence_note: str = "",
) -> dict | None:
    if not segments:
        return None

    export_dur = sum(float(s["duration_s"]) for s in segments)
    if export_dur < MIN_CLIP_S or export_dur > TARGET_MAX_S:
        return None

    if edit_mode == "hook_then_body":
        hook_seg = next((s for s in segments if s["role"] == "hook"), None)
        body_seg = next((s for s in segments if s["role"] == "body"), None)
        if not hook_seg or not body_seg:
            return None
        if not (HOOK_MIN_S <= float(hook_seg["duration_s"]) <= HOOK_MAX_S):
            return None
        body_dur = float(body_seg["duration_s"])
        if body_dur < TARGET_MIN_S or body_dur > BODY_MAX_S:
            return None

    body_seg = next((s for s in segments if s["role"] == "body"), segments[-1])
    i0 = int(body_seg["start_word_idx"])
    i1 = int(body_seg["end_word_idx"])

    text_parts = []
    for seg in segments:
        si0 = int(seg["start_word_idx"])
        si1 = int(seg["end_word_idx"])
        text_parts.append(
            " ".join((words[i].get("w") or "").strip() for i in range(si0, si1 + 1)).strip()
        )
    preview_text = " ".join(p for p in text_parts if p).strip()

    clip = {
        "id": f"clip_{uuid.uuid4().hex[:8]}",
        "title": title or "Corte",
        "hook": hook_text or insight,
        "hook_text": hook_text or "",
        "insight": insight or hook_text,
        "score": score,
        "edit_mode": edit_mode,
        "segments": segments,
        "start_word_idx": i0,
        "end_word_idx": i1,
        "preview": preview_text[:120] + ("…" if len(preview_text) > 120 else ""),
        "enabled": True,
        "status": "pending",
    }
    if coherence_note:
        clip["coherence_note"] = coherence_note
    clip["start_s"] = 0.0
    clip["end_s"] = round(export_dur, 3)
    clip["duration_s"] = round(export_dur, 3)
    return clip


def _normalize_clip(words: list[dict], raw: dict) -> dict | None:
    if not words:
        return None

    score = float(raw.get("score") or 0.5) if raw.get("score") is not None else 0.5
    if score < MIN_CLIP_SCORE:
        return None

    hook_text = str(raw.get("hook_text") or raw.get("hook") or raw.get("reason") or "").strip()
    insight = str(raw.get("insight") or hook_text).strip()
    title = str(raw.get("title") or "Corte").strip()
    coherence_note = str(raw.get("coherence_note") or "").strip()

    segments = _build_segments_from_raw(words, raw)

    if segments and len(segments) >= 2 and any(s["role"] == "hook" for s in segments):
        return _finalize_clip_from_segments(
            words, segments,
            title=title,
            hook_text=hook_text,
            insight=insight,
            score=score,
            edit_mode="hook_then_body",
            coherence_note=coherence_note,
        )

    if segments and len(segments) == 1:
        seg = segments[0]
        i0, i1 = int(seg["start_word_idx"]), int(seg["end_word_idx"])
        i0, i1 = _expand_to_min_duration(words, i0, i1, MIN_CLIP_S)
        i0, i1 = _shrink_to_max_duration(words, i0, i1, TARGET_MAX_S)
        dur = float(words[i1]["end"]) - float(words[i0]["start"])
        if dur < MIN_CLIP_S:
            return None
        seg = {
            **seg,
            "start_word_idx": i0,
            "end_word_idx": i1,
            "start_s": round(float(words[i0]["start"]), 3),
            "end_s": round(float(words[i1]["end"]), 3),
            "duration_s": round(dur, 3),
        }
        return _finalize_clip_from_segments(
            words, [seg],
            title=title,
            hook_text=hook_text,
            insight=insight,
            score=score,
            edit_mode="linear",
            coherence_note=coherence_note,
        )

    try:
        i0 = int(raw.get("start_word_idx", raw.get("start_idx", 0)))
        i1 = int(raw.get("end_word_idx", raw.get("end_idx", i0)))
    except (TypeError, ValueError):
        return None

    i0 = max(0, min(i0, len(words) - 1))
    i1 = max(i0, min(i1, len(words) - 1))
    i0 = _snap_start_to_pause(words, i0)
    i1 = _snap_end_to_pause(words, i1)
    i0, i1 = _expand_to_min_duration(words, i0, i1, MIN_CLIP_S)
    i0, i1 = _shrink_to_max_duration(words, i0, i1, TARGET_MAX_S)

    dur = float(words[i1]["end"]) - float(words[i0]["start"])
    if dur < MIN_CLIP_S:
        return None

    src_start, src_end = _segment_time_bounds(words, i0, i1)
    seg = {
        "role": "body",
        "start_word_idx": i0,
        "end_word_idx": i1,
        "start_s": round(src_start, 3),
        "end_s": round(src_end, 3),
        "duration_s": round(dur, 3),
    }
    return _finalize_clip_from_segments(
        words, [seg],
        title=title,
        hook_text=hook_text,
        insight=insight,
        score=score,
        edit_mode="linear",
        coherence_note=coherence_note,
    )


def _transcript_blocks(words: list[dict], block_size: int = CHUNK_WORDS) -> list[str]:
    lines: list[str] = []
    for i in range(0, len(words), block_size):
        chunk = words[i:i + block_size]
        parts = [f"{i + j}:{w.get('w', '')}@{float(w['start']):.1f}s" for j, w in enumerate(chunk)]
        lines.append(" ".join(parts))
    return lines


def _openai_json(system: str, user: str, *, max_tokens: int = 2500, model: str | None = None) -> dict:
    primary = model or get_clips_model()
    models = [primary]
    if primary != FALLBACK_CLIPS_MODEL:
        models.append(FALLBACK_CLIPS_MODEL)

    last_error: Exception | None = None
    for model in models:
        budget = completion_token_budget(model, max_tokens)
        temp = 0.5 if not uses_max_completion_tokens(model) else None
        for attempt in range(2):
            try:
                data = chat_json(
                    model, system, user,
                    max_tokens=budget,
                    temperature=temp,
                    timeout=300,
                )
                if data:
                    if model != primary:
                        print(f"[clips] fallback {model} OK (primário {primary} falhou)", flush=True)
                    return data
            except Exception as exc:
                last_error = exc
                print(f"[clips] {model} tentativa {attempt + 1}: {exc}", flush=True)
                budget = min(int(budget * 1.5), 32000)

    if last_error:
        raise last_error
    return {}


def _clip_selection_system(lang_hint: str, target: int, duration: float, word_count: int, focuses: list[str] | None = None) -> str:
    focus_block = _focus_instructions(focuses)
    min_dur = 45 if duration >= 60 else max(10, int(duration * 0.4))
    return (
        "Você é um editor sênior de vídeos curtos (Reels/TikTok/Shorts), especialista em transformar "
        "vídeos longos em dezenas de cortes virais." + lang_hint +
        f"\n\nAnalise a transcrição completa ({duration:.0f}s, {word_count} palavras) e selecione "
        f"**pelo menos {target} cortes** de alto valor (meta: 1 corte a cada 2–3 min de conteúdo falado).\n\n"
        "## Prioridade #1: GANCHO irresistível\n"
        "O gancho é a frase mais chamativa do corte — pergunta provocativa, afirmação forte, número chocante, "
        "punchline ou revelação. Pode vir de **qualquer minuto** do vídeo.\n" + focus_block + "\n"
        "## Estratégia de edição profissional (cold open)\n"
        "Quando o gancho NÃO está no início natural do trecho, use `edit_mode: hook_then_body`:\n"
        "1. **hook** (3–25s): a frase mais impactante, mesmo que esteja em outro ponto do vídeo\n"
        "2. **body** (até ~3 min): trecho cronológico completo onde a ideia nasce, se desenvolve e FECHA "
        "(setup → desenvolvimento → payoff). Não corte antes da conclusão.\n\n"
        "Use `edit_mode: linear` só quando o gancho já está naturalmente no início do trecho.\n\n"
        "## Requisitos de cada corte\n"
        f"- Duração total exportada (hook + body): **{min_dur}–180 segundos**\n"
        "- Autocontido: viewer entende sem ver o vídeo inteiro\n"
        "- Gancho e corpo sobre a **mesma ideia** (rejeite clickbait desconectado)\n"
        "- **Diversidade temática**: insights diferentes, não variações do mesmo minuto\n"
        "- NÃO inclua intros genéricos, 'obrigado por assistir', transições vazias\n\n"
        "## Sobreposição\n"
        "Cortes PODEM reutilizar trechos do vídeo se o gancho ou ângulo editorial for diferente. "
        "Priorize volume + qualidade, não exclusividade de timeline.\n\n"
        "Retorne JSON:\n"
        '{"clips":[{"title":"título curto","hook_text":"frase do gancho","insight":"takeaway em 1 frase",'
        '"edit_mode":"hook_then_body","coherence_note":"por que gancho e corpo são a mesma ideia",'
        '"score":0.88,"segments":[{"role":"hook","start_word_idx":4200,"end_word_idx":4250},'
        '{"role":"body","start_word_idx":1800,"end_word_idx":2400}]}]}\n\n'
        "Para cortes lineares simples, use edit_mode linear com start_word_idx/end_word_idx ou "
        'segments com role body.\n'
        "Use índices 0-based da transcrição COMPLETA. score 0–1 (inclua apenas >= 0.62)."
    )


def _summarize_block_system(lang_hint: str, focuses: list[str] | None = None) -> str:
    focus_block = _focus_instructions(focuses)
    return (
        "Você analisa segmentos de transcrição para edição de vídeos curtos profissionais." + lang_hint +
        "\n\nPara cada bloco, identifique **1–4 candidatos** a cortes com insights fortes.\n" + focus_block +
        "Para cada candidato:\n"
        "- Sugira gancho impactante (pode ser cold open de outra parte do vídeo se houver frase forte aqui)\n"
        "- Indique corpo com arco completo (setup → payoff)\n\n"
        "Retorne JSON:\n"
        '{"candidates":[{"title":"...","hook_text":"frase do gancho","insight":"takeaway",'
        '"edit_mode":"hook_then_body","score":0.85,"themes":"tema breve",'
        '"segments":[{"role":"hook","start_word_idx":120,"end_word_idx":140},'
        '{"role":"body","start_word_idx":100,"end_word_idx":400}]}]}\n'
        "Use os índices globais mostrados na transcrição. Pule filler genérico. score >= 0.62."
    )


def _transcript_full(words: list[dict]) -> str:
    parts = [f"{i}:{w.get('w', '')}@{float(w['start']):.1f}s" for i, w in enumerate(words)]
    return " ".join(parts)


def _call_gpt_clips(
    words: list[dict],
    duration: float,
    language: str,
    *,
    model: str | None = None,
    focuses: list[str] | None = None,
) -> list[dict]:
    lang_hint = ""
    if language and language != "auto":
        lang_hint = f" O idioma falado é {language}."
    else:
        lang_hint = " Detecte o idioma pela transcrição."

    target = _clip_target_count(duration)
    all_raw: list[dict] = []

    if len(words) <= SINGLE_PASS_WORDS:
        system = _clip_selection_system(lang_hint, target, duration, len(words), focuses)
        data = _openai_json(system, _transcript_full(words), max_tokens=6000, model=model)
        all_raw.extend(data.get("clips") or [])
    else:
        candidates: list[dict] = []
        blocks = _transcript_blocks(words)
        sum_system = _summarize_block_system(lang_hint, focuses)
        import concurrent.futures

        # ContextVars are not inherited by ThreadPoolExecutor workers.  Without
        # restoring the owner here, long transcripts (which use this parallel
        # block path) lose their BYOK OpenAI key and falsely report it missing.
        user_id = get_current_user_id()

        def _process_block(args: tuple[int, str]) -> dict:
            i, block_text = args
            print(f"[clips] Analisando bloco {i}/{len(blocks)}...", flush=True)
            with user_api_context(user_id):
                return _openai_json(sum_system, block_text, max_tokens=2500, model=model)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            for data in executor.map(_process_block, enumerate(blocks, 1)):
                candidates.extend(data.get("candidates") or data.get("clips") or [])

        if candidates:
            print(f"[clips] Selecionando melhores cortes entre {len(candidates)} candidatos...", flush=True)
            all_raw.extend(candidates)
        else:
            blocks = _transcript_blocks(words)
            system = _clip_selection_system(lang_hint, target, duration, len(words), focuses)
            for block in blocks:
                data = _openai_json(system, block, max_tokens=3000, model=model)
                all_raw.extend(data.get("clips") or [])

    normalized: list[dict] = []
    for raw in all_raw:
        clip = _normalize_clip(words, raw)
        if clip:
            normalized.append(clip)

    return _dedupe_similar_clips(normalized)


def detect_clips(
    words: list[dict],
    job_dir: Path,
    *,
    duration: float,
    language: str = "auto",
    force: bool = False,
    focuses: list[str] | None = None,
) -> dict:
    if not force:
        cached = load_clips(job_dir)
        if cached and cached.get("clips"):
            return cached

    safe_focuses = _sanitize_focuses(focuses)

    if not words:
        prev = load_clips(job_dir) or {}
        payload = _merge_settings(prev)
        payload.update({"clips": [], "model": get_clips_model(), "manual": False, "detect_focuses": safe_focuses})
        return save_clips(job_dir, payload)

    model_used = get_clips_model()
    detected = _call_gpt_clips(words, duration, language, focuses=safe_focuses)
    if not detected and model_used != FALLBACK_CLIPS_MODEL:
        print(f"[clips] 0 cortes com {model_used} — retentando pipeline com {FALLBACK_CLIPS_MODEL}", flush=True)
        detected = _call_gpt_clips(words, duration, language, model=FALLBACK_CLIPS_MODEL, focuses=safe_focuses)
        if detected:
            model_used = FALLBACK_CLIPS_MODEL

    prev = load_clips(job_dir) or {}
    payload = _merge_settings(prev)
    payload.update({
        "clips": detected,
        "model": model_used,
        "manual": False,
        "detecting": False,
        "detect_focuses": safe_focuses,
        "detect_error": (
            "Nenhum corte encontrado pela IA — tente Detectar de novo ou use gpt-4o em Configurações."
            if not detected
            else None
        ),
    })
    return save_clips(job_dir, payload)


def update_clips(job_dir: Path, clips: list[dict], *, manual: bool = True) -> dict:
    prev = load_clips(job_dir) or {}
    out: list[dict] = []
    for c in clips:
        item = dict(c)
        item.setdefault("status", "pending")
        item.setdefault("enabled", True)
        if "duration_s" not in item and "start_s" in item and "end_s" in item:
            item["duration_s"] = round(float(item["end_s"]) - float(item["start_s"]), 3)
        out.append(item)
    payload = _merge_settings(prev)
    payload.update({
        "clips": out,
        "model": prev.get("model", get_clips_model()),
        "manual": manual,
    })
    return save_clips(job_dir, payload)


def _merge_settings(prev: dict) -> dict:
    keys = (
        "style", "preset", "words_per_line", "aspect", "template", "resolution",
        "highlight_enabled", "overlay_asset", "profile_asset", "instagram_username",
        "logo_asset", "logo_x", "logo_y", "logo_scale", "progress_enabled",
        "progress_color", "progress_height_pct", "headline_style", "headline_bg",
        "headline_color", "headline_font_size", "headline_align", "headline_max_width_pct",
        "overlay_pos_x",
        "overlay_pos_y", "video_pos_x", "video_pos_y", "ig_bg_color", "ig_text_color",
        "ig_avatar_size", "ig_username_size", "ig_caption_size", "format_presets",
        "detect_focuses",
    )
    return {k: prev[k] for k in keys if k in prev}


def update_settings(job_dir: Path, settings: dict) -> dict:
    prev = load_clips(job_dir) or {"clips": []}
    allowed = (
        "style", "preset", "words_per_line", "aspect", "template", "resolution",
        "highlight_enabled", "overlay_asset", "profile_asset", "instagram_username",
        "logo_asset", "logo_x", "logo_y", "logo_scale", "progress_enabled",
        "progress_color", "progress_height_pct", "headline_style", "headline_bg",
        "headline_color", "headline_font_size", "headline_align", "headline_max_width_pct",
        "overlay_pos_x",
        "overlay_pos_y", "video_pos_x", "video_pos_y", "ig_bg_color", "ig_text_color",
        "ig_avatar_size", "ig_username_size", "ig_caption_size", "format_presets",
    )
    for k in allowed:
        if k in settings:
            prev[k] = settings[k]
    return save_clips(job_dir, prev)


def clip_keywords_path(job_dir: Path, clip_id: str) -> Path:
    return clip_dir(job_dir, clip_id) / "keywords.json"


def _load_clip_keywords_cache(job_dir: Path, clip_id: str) -> Optional[dict]:
    p = clip_keywords_path(job_dir, clip_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_clip_keywords_cache(
    job_dir: Path,
    clip_id: str,
    indices: list[int],
    *,
    manual: bool,
    effects: dict | None = None,
) -> dict:
    import keywords as kw_mod
    p = clip_keywords_path(job_dir, clip_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    prev = _load_clip_keywords_cache(job_dir, clip_id) or {}
    payload = {
        "indices": indices,
        "manual": manual,
        "model": prev.get("model", kw_mod.get_keywords_model()),
        "effects": effects if effects is not None else prev.get("effects") or {},
        "ts": time.time(),
    }
    p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def load_clip_keywords(job_dir: Path, clip_id: str, words: list[dict]) -> dict:
    import keywords as kw_mod
    cached = _load_clip_keywords_cache(job_dir, clip_id)
    indices = (cached or {}).get("indices") or []
    effects = (cached or {}).get("effects") or {}
    return {
        "indices": indices,
        "phrases": kw_mod.group_highlight_phrases(words, indices),
        "effects": effects,
        "manual": bool((cached or {}).get("manual")),
    }


def detect_clip_keywords(
    words: list[dict],
    job_dir: Path,
    clip_id: str,
    language: str = "auto",
    *,
    force: bool = False,
) -> dict:
    import keywords as kw_mod
    if not force:
        cached = _load_clip_keywords_cache(job_dir, clip_id)
        if cached and cached.get("indices"):
            return load_clip_keywords(job_dir, clip_id, words)
    indices = kw_mod._call_gpt(words, language)
    _save_clip_keywords_cache(job_dir, clip_id, indices, manual=False)
    return load_clip_keywords(job_dir, clip_id, words)


def save_clip_keywords(
    job_dir: Path,
    clip_id: str,
    indices: list[int],
    words: list[dict],
    effects: dict | None = None,
) -> dict:
    _save_clip_keywords_cache(job_dir, clip_id, indices, manual=True, effects=effects)
    return load_clip_keywords(job_dir, clip_id, words)


def sync_editing_to_all_clips(
    job_dir: Path,
    source_clip_id: str,
    global_words: list[dict],
    *,
    language: str = "auto",
) -> dict:
    """Apply global legend settings and copy highlight workflow from source clip to all others.

    Preserves per-clip headline, caption and overlay_asset.
    """
    data = load_clips(job_dir) or {}
    clip_list = data.get("clips") or []
    source = next((c for c in clip_list if c.get("id") == source_clip_id), None)
    if not source:
        raise ValueError("Corte de origem não encontrado")

    highlight_enabled = bool(data.get("highlight_enabled", False))
    source_sliced = words_for_render(job_dir, global_words, source)
    source_kw = load_clip_keywords(job_dir, source_clip_id, source_sliced)
    source_effects = source_kw.get("effects") or {}
    source_has_keywords = bool(source_kw.get("indices"))

    synced = 0
    keywords_synced = 0
    for clip in clip_list:
        if not clip.get("enabled", True):
            continue
        cid = clip["id"]
        if cid == source_clip_id:
            continue
        sliced = words_for_render(job_dir, global_words, clip)
        if highlight_enabled and source_has_keywords:
            detect_clip_keywords(sliced, job_dir, cid, language, force=True)
            cached = _load_clip_keywords_cache(job_dir, cid) or {}
            _save_clip_keywords_cache(
                job_dir,
                cid,
                cached.get("indices") or [],
                manual=bool(cached.get("manual")),
                effects=source_effects,
            )
            keywords_synced += 1
        synced += 1

    return {
        "synced": synced,
        "keywords_synced": keywords_synced,
        "highlight_enabled": highlight_enabled,
    }


def clip_words_path(job_dir: Path, clip_id: str) -> Path:
    return clip_dir(job_dir, clip_id) / "words.json"


def load_clip_words(job_dir: Path, clip_id: str) -> Optional[list[dict]]:
    p = clip_words_path(job_dir, clip_id)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("words") if isinstance(data, dict) else data
    except Exception:
        return None


def save_clip_words(job_dir: Path, clip_id: str, words: list[dict]) -> list[dict]:
    p = clip_words_path(job_dir, clip_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"words": words}, ensure_ascii=False), encoding="utf-8")
    return words


def _export_ordered_segments(clip: dict) -> list[dict]:
    segments = clip.get("segments") or []
    if clip.get("edit_mode") == "hook_then_body":
        ordered: list[dict] = []
        for role in ("hook", "body"):
            for seg in segments:
                if seg.get("role") == role:
                    ordered.append(seg)
                    break
        if ordered:
            return ordered
    return segments


def words_for_render(job_dir: Path, global_words: list[dict], clip: dict) -> list[dict]:
    """Clip-specific words if saved, else build export timeline from segments."""
    override = load_clip_words(job_dir, clip["id"])
    if override:
        return override
    segments = _export_ordered_segments(clip)
    if segments:
        if len(segments) > 1 or clip.get("edit_mode") == "hook_then_body":
            return merge_segment_words(global_words, segments)
        seg = segments[0]
        return slice_words(global_words, float(seg["start_s"]), float(seg["end_s"]))
    return slice_words(global_words, float(clip["start_s"]), float(clip["end_s"]))


def get_clip(job_dir: Path, clip_id: str) -> dict | None:
    data = load_clips(job_dir)
    if not data:
        return None
    for c in data.get("clips") or []:
        if c.get("id") == clip_id:
            return c
    return None


def clip_output_path(job_dir: Path, clip_id: str) -> Path:
    return job_dir / "clips" / clip_id / "output.mp4"


def clip_dir(job_dir: Path, clip_id: str) -> Path:
    d = job_dir / "clips" / clip_id
    d.mkdir(parents=True, exist_ok=True)
    return d
