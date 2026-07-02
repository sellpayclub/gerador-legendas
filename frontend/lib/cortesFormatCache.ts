import type { ComposeSettings, ExportFormatId, StyleConfig, TemplateInfo } from "@/lib/api";
import { defaultPositionForTemplate, templateForFormat } from "@/components/ClipFormatPicker";

/** Settings that vary by export format (restored when switching back). */
export type CortesFormatSnapshot = {
  position: { x: number | null; y: number | null };
  stylePos: { pos_x: number | null; pos_y: number | null };
  compose: ComposeSettings;
  videoPos: { x: number; y: number };
};

export type CortesFormatPresets = Partial<Record<ExportFormatId, CortesFormatSnapshot>>;

export function snapshotFromState(
  position: { x: number | null; y: number | null },
  style: StyleConfig,
  compose: ComposeSettings,
  videoPos: { x: number; y: number },
): CortesFormatSnapshot {
  return {
    position: { x: position.x, y: position.y },
    stylePos: { pos_x: style.pos_x ?? position.x, pos_y: style.pos_y ?? position.y },
    compose: { ...compose },
    videoPos: { x: videoPos.x, y: videoPos.y },
  };
}

export function defaultSnapshotForFormat(
  fmt: ExportFormatId,
  templates: TemplateInfo[],
  videoWidth: number,
  videoHeight: number,
  style: StyleConfig,
  compose: ComposeSettings,
): CortesFormatSnapshot {
  const tplId = templateForFormat(fmt);
  const tpl = tplId ? templates.find((t) => t.id === tplId) ?? null : null;
  const pos = defaultPositionForTemplate(tpl, videoWidth, videoHeight, style.margin_v ?? 120);
  return {
    position: pos,
    stylePos: { pos_x: pos.x, pos_y: pos.y },
    compose: {
      ...compose,
      overlay_pos_x: 0.5,
      overlay_pos_y: 0.5,
      video_pos_x: 0.5,
      video_pos_y: 0.5,
    },
    videoPos: { x: 0.5, y: 0.5 },
  };
}

export function parseFormatPresets(raw: unknown): CortesFormatPresets {
  if (!raw || typeof raw !== "object") return {};
  return raw as CortesFormatPresets;
}

/** Apply a stored snapshot to React state setters. */
export function applyFormatSnapshot(snap: CortesFormatSnapshot): {
  position: CortesFormatSnapshot["position"];
  style: Partial<StyleConfig>;
  compose: ComposeSettings;
  videoPos: CortesFormatSnapshot["videoPos"];
} {
  return {
    position: snap.position,
    style: { pos_x: snap.stylePos.pos_x, pos_y: snap.stylePos.pos_y },
    compose: { ...snap.compose },
    videoPos: { ...snap.videoPos },
  };
}

/** Flatten compose snapshot into ClipsSettings patch fields. */
export function composeToSettingsPatch(compose: ComposeSettings): Partial<ComposeSettings> {
  return { ...compose };
}
