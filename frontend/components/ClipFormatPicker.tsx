"use client";

import type { ExportFormatId, TemplateInfo } from "@/lib/api";
export const CORTES_VERTICAL = {
  width: 1080,
  height: 1920,
  subtitleSafeY: 1820,
} as const;

export const FORMAT_OPTIONS: { id: ExportFormatId; label: string; desc: string }[] = [
  { id: "original", label: "Original", desc: "Proporção do vídeo de entrada" },
  { id: "reels_full", label: "9:16 Tela cheia", desc: "Vertical com crop central" },
  { id: "choquei_image", label: "Choquei (imagem)", desc: "Imagem em cima, 70% vídeo embaixo" },
  { id: "choquei_video", label: "Choquei (vídeo)", desc: "Vídeo loop em cima, 70% embaixo" },
];

export function formatToBackend(fmt: ExportFormatId): {
  aspect: "original" | "vertical";
  template: string | null;
} {
  if (fmt === "original") return { aspect: "original", template: null };
  return { aspect: "vertical", template: fmt };
}

export function backendToFormat(
  aspect?: string,
  template?: string | null,
): ExportFormatId {
  if (template === "choquei_image") return "choquei_image";
  if (template === "choquei_video") return "choquei_video";
  if (template === "noticia_choquei") return "reels_full";
  if (template === "reels_full" || aspect === "vertical") return "reels_full";
  return "original";
}

type Props = {
  format: ExportFormatId;
  onChange: (f: ExportFormatId) => void;
  disabled?: boolean;
  compact?: boolean;
};

export default function ClipFormatPicker({ format, onChange, disabled, compact }: Props) {
  return (
    <div className={compact ? "px-4 py-3" : "rounded-lg border border-border bg-panel/50 p-3"}>
      <p className="mb-2 text-xs font-medium text-zinc-300">
        Formato do vídeo final
        {!compact && (
          <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
            Escolha antes de posicionar a legenda — o preview muda na hora.
          </span>
        )}
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {FORMAT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`rounded-lg border px-2.5 py-2 text-left text-xs transition disabled:opacity-50 ${
              format === opt.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="block font-medium">{opt.label}</span>
            <span className="mt-0.5 block text-[10px] opacity-70">{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function defaultPositionForTemplate(
  tpl: TemplateInfo | null,
  videoWidth: number,
  videoHeight: number,
  marginV: number,
): { x: number; y: number } {
  if (tpl) {
    return {
      x: tpl.subtitle_safe_x ?? tpl.width / 2,
      y: tpl.subtitle_safe_y,
    };
  }
  return { x: videoWidth / 2, y: videoHeight - marginV };
}

/** @deprecated use defaultPositionForTemplate */
export function defaultPositionForAspect(
  aspect: "original" | "vertical",
  videoWidth: number,
  videoHeight: number,
  marginV: number,
): { x: number; y: number } {
  if (aspect === "vertical") {
    return { x: CORTES_VERTICAL.width / 2, y: CORTES_VERTICAL.subtitleSafeY };
  }
  return { x: videoWidth / 2, y: videoHeight - marginV };
}

export function templateForFormat(fmt: ExportFormatId): string | null {
  return formatToBackend(fmt).template;
}

export function isComposeFormat(fmt: ExportFormatId): boolean {
  return fmt !== "original";
}

/**
 * Formats rendered through compose templates use TemplatePreview so the
 * preview mirrors the FFmpeg crop (video_pos) exactly — including 9:16
 * full-bleed, which VideoPreview cannot represent (no crop positioning).
 */
export function usesTemplatePreview(fmt: ExportFormatId): boolean {
  return fmt === "reels_full" || fmt === "choquei_image" || fmt === "choquei_video";
}

export function needsOverlay(fmt: ExportFormatId): boolean {
  return fmt === "choquei_image" || fmt === "choquei_video";
}

export function overlayAccepts(fmt: ExportFormatId): ("image" | "video")[] {
  if (fmt === "choquei_image") return ["image"];
  if (fmt === "choquei_video") return ["video"];
  return ["image", "video"];
}
