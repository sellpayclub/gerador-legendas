/** Shared word display helpers (preview + transcript editor). */

export type TextCase = "normal" | "upper" | "lower";

const LEADING_EMOJI_RE =
  /^(\s*(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}])+\s*)+/u;

const ANY_EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

export function applyTextCase(text: string, textCase?: TextCase): string {
  if (textCase === "upper") return text.toUpperCase();
  if (textCase === "lower") return text.toLowerCase();
  return text;
}

export function stripEmojis(text: string): string {
  return text.replace(LEADING_EMOJI_RE, "").replace(ANY_EMOJI_RE, "").replace(/\s+/g, " ").trim();
}

export function formatWordLabel(text: string, textCase?: TextCase): string {
  return applyTextCase(text.trim(), textCase);
}
