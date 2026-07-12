/** Resolve and clamp subtitle anchor in PlayRes canvas coordinates. */

export function clampSubtitlePosition(
  pos: { x: number | null; y: number | null },
  width: number,
  height: number,
  marginV = 120,
): { x: number; y: number } {
  const defaultX = width / 2;
  const defaultY = height - marginV;
  const x = Math.max(width * 0.05, Math.min(width * 0.95, pos.x ?? defaultX));
  const y = Math.max(height * 0.08, Math.min(height * 0.92, pos.y ?? defaultY));
  return { x, y };
}

export function resolveSubtitlePosition(
  style: { pos_x?: number | null; pos_y?: number | null; margin_v?: number },
  position: { x: number | null; y: number | null },
  width: number,
  height: number,
  fallback?: { x: number; y: number },
): { x: number; y: number } {
  const marginV = style.margin_v ?? 120;
  const raw = {
    x: style.pos_x ?? position.x ?? fallback?.x ?? width / 2,
    y: style.pos_y ?? position.y ?? fallback?.y ?? height - marginV,
  };
  return clampSubtitlePosition(raw, width, height, marginV);
}

export function isPositionOutOfCanvas(
  pos: { x: number | null; y: number | null },
  width: number,
  height: number,
): boolean {
  if (pos.x != null && (pos.x < 0 || pos.x > width)) return true;
  if (pos.y != null && (pos.y < 0 || pos.y > height)) return true;
  return false;
}
