import type { ClipSegment, Word } from "@/lib/api";
import { sliceWordsForClip } from "@/lib/api";

export type PlaybackSegment = {
  role: string;
  start_s: number;
  end_s: number;
};

export function getClipPlaybackPlan(clip: ClipSegment): PlaybackSegment[] {
  if (clip.segments?.length) {
    if (clip.edit_mode === "hook_then_body") {
      const hook = clip.segments.find((s) => s.role === "hook");
      const body = clip.segments.find((s) => s.role === "body");
      const ordered = [hook, body].filter(Boolean) as typeof clip.segments;
      if (ordered.length) {
        return ordered.map((s) => ({
          role: s.role,
          start_s: s.start_s,
          end_s: s.end_s,
        }));
      }
    }
    return clip.segments.map((s) => ({
      role: s.role,
      start_s: s.start_s,
      end_s: s.end_s,
    }));
  }
  return [{ role: "body", start_s: clip.start_s, end_s: clip.end_s }];
}

export function getClipExportDuration(clip: ClipSegment): number {
  if (clip.edit_mode === "hook_then_body" && clip.segments?.length) {
    return clip.segments.reduce(
      (sum, s) => sum + (s.duration_s ?? s.end_s - s.start_s),
      0,
    );
  }
  return clip.duration_s;
}

export function mergeWordsForClip(words: Word[], clip: ClipSegment): Word[] {
  const plan = getClipPlaybackPlan(clip);
  if (plan.length <= 1 && clip.edit_mode !== "hook_then_body") {
    return sliceWordsForClip(words, clip.start_s, clip.end_s);
  }
  const out: Word[] = [];
  let offset = 0;
  for (const seg of plan) {
    const sliced = sliceWordsForClip(words, seg.start_s, seg.end_s);
    for (const w of sliced) {
      out.push({
        w: w.w,
        start: Math.round((w.start + offset) * 1000) / 1000,
        end: Math.round((w.end + offset) * 1000) / 1000,
      });
    }
    offset += seg.end_s - seg.start_s;
  }
  return out;
}

/** Map clip words (export timeline) to source video timestamps for preview. */
export function clipWordsToSourceWords(clip: ClipSegment, clipWords: Word[]): Word[] {
  if (clip.edit_mode !== "hook_then_body" || !clip.segments?.length) {
    return clipWords.map((w) => ({
      ...w,
      start: w.start + clip.start_s,
      end: w.end + clip.start_s,
    }));
  }

  const out: Word[] = [];
  let exportOffset = 0;
  for (const seg of clip.segments) {
    const segDur = seg.duration_s ?? seg.end_s - seg.start_s;
    for (const w of clipWords) {
      if (w.end <= exportOffset || w.start >= exportOffset + segDur) continue;
      out.push({
        w: w.w,
        start: Math.round((w.start - exportOffset + seg.start_s) * 1000) / 1000,
        end: Math.round((w.end - exportOffset + seg.start_s) * 1000) / 1000,
      });
    }
    exportOffset += segDur;
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Map source video time to export timeline position (for progress bar). */
export function sourceTimeToExportTime(clip: ClipSegment, sourceT: number): number | null {
  if (clip.edit_mode !== "hook_then_body" || !clip.segments?.length) {
    if (sourceT < clip.start_s || sourceT > clip.end_s) return null;
    return sourceT - clip.start_s;
  }
  let offset = 0;
  for (const seg of clip.segments) {
    const dur = seg.duration_s ?? seg.end_s - seg.start_s;
    if (sourceT >= seg.start_s && sourceT <= seg.end_s + 0.05) {
      return offset + (sourceT - seg.start_s);
    }
    offset += dur;
  }
  return null;
}

export function getActivePlaybackSegment(
  clip: ClipSegment,
  sourceT: number,
): PlaybackSegment | null {
  const plan = getClipPlaybackPlan(clip);
  for (const seg of plan) {
    if (sourceT >= seg.start_s && sourceT <= seg.end_s + 0.05) return seg;
  }
  return plan[0] ?? null;
}

export function exportTimeToSourceTime(clip: ClipSegment, exportT: number): number {
  if (clip.edit_mode !== "hook_then_body" || !clip.segments?.length) {
    return exportT + clip.start_s;
  }
  let offset = 0;
  for (const seg of clip.segments) {
    const dur = seg.duration_s ?? seg.end_s - seg.start_s;
    if (exportT <= offset + dur) {
      return seg.start_s + (exportT - offset);
    }
    offset += dur;
  }
  const last = clip.segments[clip.segments.length - 1];
  return last.end_s;
}

export function getClipPreviewStart(clip: ClipSegment): number {
  const plan = getClipPlaybackPlan(clip);
  return plan[0]?.start_s ?? clip.start_s;
}
