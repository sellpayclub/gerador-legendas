/** Shared compose layout metrics — preview must mirror backend/overlays.py. */

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

function upperNonEmojiSegment(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out += text.slice(last, idx).toUpperCase();
    out += m[0];
    last = idx + m[0].length;
  }
  return out + text.slice(last).toUpperCase();
}

export const HEADLINE_BORDER_BOLD = 24;
export const HEADLINE_BORDER_SIMPLE = 8;
/** Subtle corner radius — preview must mirror backend/overlays.py headline_box_radius. */
export const HEADLINE_RADIUS_BOLD = 14;
export const HEADLINE_RADIUS_SIMPLE = 10;
export const PROGRESS_HEIGHT_MIN = 0.02;
export const PROGRESS_HEIGHT_MAX = 0.12;

export function headlineFontSize(size?: number): number {
  return Math.max(20, Math.min(80, Math.round(size ?? 42)));
}

export function headlineBoxBorder(style?: string): number {
  return style === "bold_red" ? HEADLINE_BORDER_BOLD : HEADLINE_BORDER_SIMPLE;
}

export function headlineBorderRadius(style?: string, scale = 1): number {
  const base = style === "bold_red" ? HEADLINE_RADIUS_BOLD : HEADLINE_RADIUS_SIMPLE;
  return Math.max(4, Math.round(base * scale));
}

export function clampProgressHeightPct(pct?: number): number {
  const v = pct ?? 0.04;
  return Math.max(PROGRESS_HEIGHT_MIN, Math.min(PROGRESS_HEIGHT_MAX, v));
}

/** Bar height in px for a canvas of height `canvasH` (same as backend). */
export function progressBarHeightPx(canvasH: number, pct?: number): number {
  return Math.max(1, Math.round(canvasH * clampProgressHeightPct(pct)));
}

/** Headline display text — preserve line breaks; uppercase only non-emoji (bold_red). */
export function headlineDisplayText(text: string, style?: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (style !== "bold_red") return normalized;
  return normalized.split("\n").map(upperNonEmojiSegment).join("\n");
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

  ctx.font = `700 ${fontSizePx}px Roboto, "Noto Color Emoji", sans-serif`;
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
