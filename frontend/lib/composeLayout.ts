/** Shared compose layout metrics — preview must mirror backend/overlays.py. */

export const HEADLINE_BORDER_BOLD = 24;
export const HEADLINE_BORDER_SIMPLE = 8;
export const PROGRESS_HEIGHT_MIN = 0.02;
export const PROGRESS_HEIGHT_MAX = 0.12;

export function headlineFontSize(size?: number): number {
  return Math.max(20, Math.min(80, Math.round(size ?? 42)));
}

export function headlineBoxBorder(style?: string): number {
  return style === "bold_red" ? HEADLINE_BORDER_BOLD : HEADLINE_BORDER_SIMPLE;
}

export function clampProgressHeightPct(pct?: number): number {
  const v = pct ?? 0.04;
  return Math.max(PROGRESS_HEIGHT_MIN, Math.min(PROGRESS_HEIGHT_MAX, v));
}

/** Bar height in px for a canvas of height `canvasH` (same as backend). */
export function progressBarHeightPx(canvasH: number, pct?: number): number {
  return Math.max(1, Math.round(canvasH * clampProgressHeightPct(pct)));
}

/** Headline display text — preserve user line breaks; only apply case style. */
export function headlineDisplayText(text: string, style?: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return style === "bold_red" ? normalized.toUpperCase() : normalized;
}

/** Same clamp as backend/overlays.py (50–100% of canvas width). */
export function clampHeadlineWidthPct(pct?: number): number {
  const v = pct ?? 0.85;
  return Math.max(0.5, Math.min(1.0, v));
}

/** Word-wrap per paragraph; preserve explicit newlines — mirrors backend layout_headline_lines. */
export function layoutHeadlineLines(
  text: string,
  maxWidthPx: number,
  fontSizePx: number,
): string[] {
  if (!text.trim()) return [];
  if (typeof document === "undefined") return text.split("\n");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.split("\n");

  ctx.font = `700 ${fontSizePx}px Roboto, sans-serif`;
  const measure = (s: string) => ctx.measureText(s || " ").width;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  const limit = Math.max(20, maxWidthPx);

  for (const paragraph of normalized.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (measure(trial) <= limit || !current) {
        current = trial;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [normalized];
}
