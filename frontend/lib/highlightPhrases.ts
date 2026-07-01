import type { Word } from "./api";

export type HighlightPhrase = {
  indices: number[];
  start: number;
  end: number;
  text: string;
};

/** Mirror backend group_highlight_phrases — strict 1–2 words per moment. */
export function groupHighlightPhrases(
  words: Word[],
  indices: number[],
  opts?: { maxWords?: number; holdS?: number },
): HighlightPhrase[] {
  if (!indices.length || !words.length) return [];

  const maxWords = opts?.maxWords ?? 2;
  const holdS = opts?.holdS ?? 0.12;

  const selected = [...new Set(indices.filter((i) => i >= 0 && i < words.length))].sort((a, b) => a - b);
  if (!selected.length) return [];

  const runs: number[][] = [];
  let run = [selected[0]];
  for (let j = 1; j < selected.length; j++) {
    if (selected[j] === run[run.length - 1] + 1) {
      run.push(selected[j]);
    } else {
      runs.push(run);
      run = [selected[j]];
    }
  }
  runs.push(run);

  const moments: HighlightPhrase[] = [];
  for (const r of runs) {
    for (let i = 0; i < r.length; i += maxWords) {
      const chunk = r.slice(i, i + maxWords);
      const text = chunk.map((idx) => (words[idx].w || "").trim()).filter(Boolean).join(" ");
      if (!text) continue;
      moments.push({
        indices: chunk,
        start: words[chunk[0]].start,
        end: words[chunk[chunk.length - 1]].end + holdS,
        text,
      });
    }
  }
  return moments;
}

export function activePhrase(phrases: HighlightPhrase[], t: number): HighlightPhrase | null {
  for (const ph of phrases) {
    if (t >= ph.start && t <= ph.end) return ph;
  }
  return null;
}

/** Blur window — mirrors backend/effects.py (_window). */
export const HIGHLIGHT_PRE_S = 0.12;
export const HIGHLIGHT_POST_S = 0.25;

export function phraseEffectWindow(ph: HighlightPhrase): { start: number; end: number } {
  return {
    start: Math.max(0, ph.start - HIGHLIGHT_PRE_S),
    end: ph.end + HIGHLIGHT_POST_S,
  };
}

export function inHighlightEffectWindow(phrases: HighlightPhrase[], t: number): boolean {
  return phrases.some((ph) => {
    const w = phraseEffectWindow(ph);
    return t >= w.start && t <= w.end;
  });
}
