/** Pause-aware subtitle grouping — mirrors backend/timing.py */
import type { Word } from "./api";

export const KARAOKE_LEAD_S = 0.055;
export const DEFAULT_PAUSE_THRESHOLD_S = 0.45;
export const LINE_END_PAD_S = 0.05;
export const MIN_GAP_TRIM_S = 0.12;

export function gapAfter(words: Word[], i: number): number {
  if (i >= words.length - 1) return 999;
  return words[i + 1].start - words[i].end;
}

export function trimWordEnds(words: Word[], minGapS = MIN_GAP_TRIM_S): Word[] {
  if (!words.length) return words;
  return words.map((w, i) => {
    let end = w.end;
    if (i < words.length - 1) {
      const g = gapAfter(words, i);
      if (g > minGapS) {
        const trimTo = words[i + 1].start - minGapS * 0.5;
        end = Math.min(end, Math.max(w.start + 0.04, trimTo));
      }
    }
    return { ...w, end: Math.round(end * 1000) / 1000 };
  });
}

export function groupWordsByPause(
  words: Word[],
  maxWords: number,
  pauseThresholdS = DEFAULT_PAUSE_THRESHOLD_S,
): Word[][] {
  if (!words.length) return [];
  const n = Math.max(1, maxWords);
  const groups: Word[][] = [];
  let current: Word[] = [];

  words.forEach((w, i) => {
    if (current.length > 0) {
      const g = gapAfter(words, i - 1);
      if (g > pauseThresholdS || current.length >= n) {
        groups.push(current);
        current = [];
      }
    }
    current.push(w);
  });
  if (current.length) groups.push(current);
  return groups;
}

export function lineVisibilityWindow(group: Word[]): { start: number; end: number } {
  if (!group.length) return { start: 0, end: 0 };
  const start = group[0].start - KARAOKE_LEAD_S;
  const end = group[group.length - 1].end + LINE_END_PAD_S;
  return { start, end: Math.max(start + 0.02, end) };
}
