/** Hex color + alpha 0..1 → rgba() for CSS preview (matches backend ass opacity). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const s = hex.replace("#", "");
  let r = "0";
  let g = "0";
  let b = "0";
  if (s.length === 6) {
    r = s.slice(0, 2);
    g = s.slice(2, 4);
    b = s.slice(4, 6);
  } else if (s.length === 3) {
    r = s[0] + s[0];
    g = s[1] + s[1];
    b = s[2] + s[2];
  }
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${a})`;
}
