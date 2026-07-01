"use client";

import type { ComposeSettings } from "@/lib/api";

type Props = {
  compose: ComposeSettings;
  onChange: (patch: Partial<ComposeSettings>) => void;
  showHeadline?: boolean;
  showInstagram?: boolean;
  showProgress?: boolean;
  showOverlayCrop?: boolean;
};

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="w-20 shrink-0">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-[10px]" />
    </label>
  );
}

function RangeField({
  label, min, max, step, value, onChange, unit = "",
}: {
  label: string; min: number; max: number; step?: number; value: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      <span className="mb-1 block">{label}: {value}{unit}</span>
      <input type="range" min={min} max={max} step={step ?? 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

export default function ComposeStyleControls({
  compose, onChange, showHeadline, showInstagram, showProgress, showOverlayCrop,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-panel/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Personalização</p>

      {showHeadline && (
        <div className="space-y-2 border-b border-border/40 pb-3">
          <p className="text-[10px] font-medium text-zinc-500">Headline</p>
          <RangeField label="Tamanho fonte" min={24} max={72} value={compose.headline_font_size ?? 42}
            onChange={(v) => onChange({ headline_font_size: v })} unit="px" />
          <RangeField label="Largura" min={50} max={100}
            value={Math.round((compose.headline_max_width_pct ?? 0.85) * 100)}
            onChange={(v) => onChange({ headline_max_width_pct: v / 100 })} unit="%" />
          <label className="block text-xs text-zinc-400">
            Alinhamento
            <select value={compose.headline_align ?? "center"}
              onChange={(e) => onChange({ headline_align: e.target.value as ComposeSettings["headline_align"] })}
              className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm">
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <ColorField label="Fundo" value={compose.headline_bg ?? "#E31B23"}
            onChange={(v) => onChange({ headline_bg: v })} />
          <ColorField label="Texto" value={compose.headline_color ?? "#FFFFFF"}
            onChange={(v) => onChange({ headline_color: v })} />
        </div>
      )}

      {showInstagram && (
        <div className="space-y-2 border-b border-border/40 pb-3">
          <p className="text-[10px] font-medium text-zinc-500">Header Instagram</p>
          <ColorField label="Fundo" value={compose.ig_bg_color ?? "#FFFFFF"}
            onChange={(v) => onChange({ ig_bg_color: v })} />
          <ColorField label="Texto" value={compose.ig_text_color ?? "#141414"}
            onChange={(v) => onChange({ ig_text_color: v })} />
          <RangeField label="Avatar" min={48} max={96} value={compose.ig_avatar_size ?? 72}
            onChange={(v) => onChange({ ig_avatar_size: v })} unit="px" />
          <RangeField label="@usuario" min={22} max={48} value={compose.ig_username_size ?? 34}
            onChange={(v) => onChange({ ig_username_size: v })} unit="px" />
          <RangeField label="Caption" min={18} max={40} value={compose.ig_caption_size ?? 28}
            onChange={(v) => onChange({ ig_caption_size: v })} unit="px" />
        </div>
      )}

      {showOverlayCrop && (
        <div className="space-y-2 border-b border-border/40 pb-3">
          <p className="text-[10px] font-medium text-zinc-500">Enquadramento mídia</p>
          <p className="text-[10px] text-zinc-600">Arraste a imagem/vídeo no preview ou ajuste aqui.</p>
          <RangeField label="Crop X" min={0} max={100} value={Math.round((compose.overlay_pos_x ?? 0.5) * 100)}
            onChange={(v) => onChange({ overlay_pos_x: v / 100 })} unit="%" />
          <RangeField label="Crop Y" min={0} max={100} value={Math.round((compose.overlay_pos_y ?? 0.5) * 100)}
            onChange={(v) => onChange({ overlay_pos_y: v / 100 })} unit="%" />
        </div>
      )}

      {showProgress && compose.progress_enabled && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-zinc-500">Barra de progresso</p>
          <ColorField label="Cor" value={compose.progress_color ?? "#E31B23"}
            onChange={(v) => onChange({ progress_color: v })} />
          <RangeField label="Altura" min={2} max={12}
            value={Math.round((compose.progress_height_pct ?? 0.04) * 100)}
            onChange={(v) => onChange({ progress_height_pct: v / 100 })} unit="%" />
        </div>
      )}
    </div>
  );
}
