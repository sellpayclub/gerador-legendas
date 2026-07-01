import type { CSSProperties } from "react";
import type { StyleConfig } from "@/lib/api";
import { playResToCss } from "@/lib/subtitleLayout";

/** CSS outline that mirrors libass \\bord — works in preview for karaoke + hero. */
export function captionOutlineStyle(
  style: StyleConfig,
  scaleY: number,
  fillColor?: string,
): CSSProperties {
  if (style.box) return fillColor ? { color: fillColor } : {};
  const ow = playResToCss(style.outline_width, scaleY);
  if (ow <= 0) return fillColor ? { color: fillColor } : {};
  const stroke = `${ow}px ${style.outline_color}`;
  return {
    ...(fillColor ? { color: fillColor } : {}),
    WebkitTextStroke: stroke,
    WebkitTextFillColor: fillColor ?? "currentColor",
    paintOrder: "stroke fill",
  };
}

/** Eight-direction shadow fallback when stroke is too thin to see. */
export function outlineTextShadow(color: string, width: number): string | undefined {
  const w = Math.max(1, Math.round(width));
  if (w <= 0) return undefined;
  const dirs: [number, number][] = [];
  for (let dx = -w; dx <= w; dx++) {
    for (let dy = -w; dy <= w; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (dx * dx + dy * dy <= w * w) dirs.push([dx, dy]);
    }
  }
  return dirs.map(([dx, dy]) => `${dx}px ${dy}px 0 ${color}`).join(", ");
}
