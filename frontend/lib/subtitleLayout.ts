import type { CSSProperties } from "react";
import type { StyleConfig, Word } from "@/lib/api";

/** Same grouping logic as backend ass_gen._group_words */
export function groupWords(words: Word[], wordsPerLine: number): Word[][] {
  const groups: Word[][] = [];
  const n = Math.max(1, wordsPerLine);
  for (let i = 0; i < words.length; i += n) {
    groups.push(words.slice(i, i + n));
  }
  return groups;
}

export function wordLabel(w: Word): string {
  return (w.w || "").trim();
}

/** Scale PlayRes units to CSS pixels on the preview video element. */
export function playResToCss(value: number, scaleY: number): number {
  return value * scaleY;
}

/** Map preset font names to loaded webfont CSS variables. */
export function fontFamilyCss(font: string): string {
  if (font === "Montserrat") return "var(--font-montserrat), sans-serif";
  if (font === "Inter") return "var(--font-inter), sans-serif";
  return `'${font}', sans-serif`;
}

/** 8-direction outline shadow approximating libass BorderStyle=1. */
export function outlineShadow(color: string, widthPx: number): string | undefined {
  if (widthPx <= 0) return undefined;
  const w = Math.max(1, Math.round(widthPx));
  const dirs: [number, number][] = [
    [w, 0], [-w, 0], [0, w], [0, -w],
    [w, w], [w, -w], [-w, w], [-w, -w],
  ];
  return dirs.map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(", ");
}

/** Preview typography matching ASS/libass output (WYSIWYG). */
export function subtitleTextStyle(
  style: StyleConfig,
  scaleY: number,
  opts: { color: string; isActive: boolean; isLastInGroup?: boolean }
): CSSProperties {
  const fs = playResToCss(style.font_size, scaleY);
  const ow = playResToCss(style.outline_width, scaleY);
  const ls = playResToCss(style.letter_spacing ?? 2, scaleY);
  // Match ass_gen: one space + (word_spacing // 4) extra spaces between words.
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
    fontWeight: style.bold ? 800 : 500,
    fontStyle: style.italic ? "italic" : "normal",
    letterSpacing: `${ls}px`,
    marginRight: opts.isLastInGroup ? 0 : `${wordGapEm}em`,
    lineHeight: 1.15,
    textShadow: !style.box ? outlineShadow(style.outline_color, ow) : undefined,
    display: opts.isActive && style.animation === "pop" ? "inline-block" : "inline",
    transform: pop,
    transition: "transform 80ms ease-out, color 80ms",
  };
}

export function findActiveGroup(
  groups: Word[][],
  words: Word[],
  currentTime: number
): { group: Word[] | null; activeIdx: number } {
  const activeIdx = words.findIndex(
    (w) => currentTime >= w.start - 0.01 && currentTime < w.end
  );

  if (activeIdx >= 0) {
    for (const g of groups) {
      const startIdx = words.indexOf(g[0]);
      if (startIdx <= activeIdx && activeIdx < startIdx + g.length) {
        return { group: g, activeIdx };
      }
    }
  }

  for (const g of groups) {
    if (g[0].start <= currentTime + 0.05 && g[g.length - 1].end >= currentTime - 0.5) {
      return { group: g, activeIdx: activeIdx >= 0 ? activeIdx : words.indexOf(g[0]) };
    }
  }

  if (groups.length > 0) {
    return { group: groups[0], activeIdx: words.indexOf(groups[0][0]) };
  }
  return { group: null, activeIdx: -1 };
}
