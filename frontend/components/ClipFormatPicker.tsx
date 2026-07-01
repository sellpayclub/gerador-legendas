"use client";

/** Matches backend templates.reels_full — vertical 9:16 export for cortes. */
export const CORTES_VERTICAL = {
  width: 1080,
  height: 1920,
  subtitleSafeY: 1820,
} as const;

type Props = {
  aspect: "original" | "vertical";
  onChange: (a: "original" | "vertical") => void;
  disabled?: boolean;
  compact?: boolean;
};

export default function ClipFormatPicker({ aspect, onChange, disabled, compact }: Props) {
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
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("vertical")}
          className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition disabled:opacity-50 ${
            aspect === "vertical"
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="inline-block h-5 w-3 rounded-sm border-2 border-current" />
          9:16 Vertical
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("original")}
          className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition disabled:opacity-50 ${
            aspect === "original"
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="inline-block h-3 w-5 rounded-sm border-2 border-current" />
          Original
        </button>
      </div>
    </div>
  );
}

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
