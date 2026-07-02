import type { CSSProperties } from "react";
import type { StyleConfig, Word } from "@/lib/api";
import { formatWordLabel, type TextCase } from "@/lib/textFormat";
import {
  KARAOKE_LEAD_S,
  groupWordsByPause,
  lineVisibilityWindow,
  nonOverlappingLineWindows,
} from "@/lib/timing";

export { KARAOKE_LEAD_S, groupWordsByPause, lineVisibilityWindow, nonOverlappingLineWindows };

export function isWordActive(w: Word, currentTime: number): boolean {
  return currentTime >= w.start - KARAOKE_LEAD_S && currentTime < w.end;
}
/** @deprecated Use groupWordsByPause — kept for callers passing fixed chunk size only. */
export function groupWords(words: Word[], wordsPerLine: number): Word[][] {
  return groupWordsByPause(words, wordsPerLine);
}

export function wordLabel(w: Word, textCase?: TextCase): string {
  return formatWordLabel(w.w || "", textCase);
}

/** Scale PlayRes units to CSS pixels on the preview video element. */
export function playResToCss(value: number, scaleY: number): number {
  return value * scaleY;
}

/** Map bundled font names to loaded webfont CSS variables. */
export function fontFamilyCss(font: string): string {
  const map: Record<string, string> = {
    Roboto: "var(--font-roboto), sans-serif",
    "Open Sans": "var(--font-open-sans), sans-serif",
    Lato: "var(--font-lato), sans-serif",
    Raleway: "var(--font-raleway), sans-serif",
    Montserrat: "var(--font-montserrat), sans-serif",
    Inter: "var(--font-inter), sans-serif",
  };
  return map[font] ?? `'${font}', sans-serif`;
}

/** Solid stroke outline for single-line text (hero). Prefer KaraokeLine for multi-word karaoke. */
export function strokeOutlineStyle(
  style: StyleConfig,
  scaleY: number,
): Pick<CSSProperties, "WebkitTextStroke" | "paintOrder"> | undefined {
  if (style.box) return undefined;
  const ow = playResToCss(style.outline_width, scaleY);
  if (ow <= 0) return undefined;
  return {
    WebkitTextStroke: `${ow}px ${style.outline_color}`,
    paintOrder: "stroke fill",
  };
}

/** Preview typography for a single word (no outline — use KaraokeLine for groups). */
export function subtitleTextStyle(
  style: StyleConfig,
  scaleY: number,
  opts: { color: string; isActive: boolean; isLastInGroup?: boolean }
): CSSProperties {
  const fs = playResToCss(style.font_size, scaleY);
  const ls = playResToCss(style.letter_spacing ?? 2, scaleY);
  const spaceCount = 1 + Math.floor((style.word_spacing ?? 4) / 4);
  const wordGapEm = spaceCount * 0.28;
  const pop =
    opts.isActive && style.animation === "pop"
      ? `scale(${style.pop_scale / 100})`
      : "scale(1)";

  return {
    color: opts.color,
    fontSize: fs,
    fontFamily: fontFamilyCss(style.font),
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    letterSpacing: `${ls}px`,
    marginRight: opts.isLastInGroup ? 0 : `${wordGapEm}em`,
    lineHeight: 1.15,
    display: opts.isActive && style.animation === "pop" ? "inline-block" : "inline",
    transform: pop,
    transition: opts.isActive && style.animation === "pop" ? "transform 80ms ease-out" : undefined,
  };
}

export function findActiveGroup(
  groups: Word[][],
  words: Word[],
  currentTime: number,
  opts?: { staticPreview?: boolean },
): { group: Word[] | null; activeIdx: number } {
  if (!groups.length) return { group: null, activeIdx: -1 };

  const windows = nonOverlappingLineWindows(groups);
  const activeIdx = words.findIndex((w) => isWordActive(w, currentTime));

  if (activeIdx >= 0) {
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const startIdx = words.indexOf(g[0]);
      if (startIdx <= activeIdx && activeIdx < startIdx + g.length) {
        return { group: g, activeIdx };
      }
    }
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const { start, end } = windows[gi];
    if (currentTime >= start && currentTime <= end) {
      const idx = activeIdx >= 0 ? activeIdx : words.indexOf(groups[gi][0]);
      return { group: groups[gi], activeIdx: idx };
    }
  }

  // Static preview only before speech starts (style editing at t≈0).
  if (opts?.staticPreview) {
    const firstStart = windows[0]?.start ?? groups[0][0].start;
    if (currentTime < firstStart + 0.001) {
      return { group: groups[0], activeIdx: words.indexOf(groups[0][0]) };
    }
  }

  return { group: null, activeIdx: -1 };
}
