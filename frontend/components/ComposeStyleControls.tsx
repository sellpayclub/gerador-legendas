"use client";

import type { ComposeSettings } from "@/lib/api";
import { clampHeadlineWidthPct, clampProgressHeightPct } from "@/lib/composeLayout";
import Section from "@/components/ui/Section";
import { inputClass } from "@/components/ui/inputClass";
import { useI18n } from "@/lib/i18n/context";

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
    <label className="block">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-transparent" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} font-mono text-sm`} />
      </div>
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
    <label className="block">
      <span className="label">{label}: {value}{unit}</span>
      <input type="range" min={min} max={max} step={step ?? 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

export default function ComposeStyleControls({
  compose, onChange, showHeadline, showInstagram, showProgress, showOverlayCrop,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 p-3">
      {showHeadline && (
        <Section title="Headline" description="Fonte, largura e cores" collapsible defaultOpen>
          <div className="space-y-3">
            <RangeField label={`${t("common.size")} fonte`} min={24} max={72} value={compose.headline_font_size ?? 42}
              onChange={(v) => onChange({ headline_font_size: v })} unit="px" />
            <RangeField label={t("common.width")} min={50} max={100}
              value={Math.round(clampHeadlineWidthPct(compose.headline_max_width_pct) * 100)}
              onChange={(v) => onChange({ headline_max_width_pct: clampHeadlineWidthPct(v / 100) })} unit="%" />
            <label className="block">
              <span className="label">{t("style.alignment")}</span>
              <select value={compose.headline_align ?? "center"}
                onChange={(e) => onChange({ headline_align: e.target.value as ComposeSettings["headline_align"] })}
                className={inputClass}>
                <option value="left">{t("style.alignLeft")}</option>
                <option value="center">{t("style.alignCenter")}</option>
                <option value="right">{t("style.alignRight")}</option>
              </select>
            </label>
            <ColorField label={t("common.background")} value={compose.headline_bg ?? "#E31B23"}
              onChange={(v) => onChange({ headline_bg: v })} />
            <ColorField label={t("common.text")} value={compose.headline_color ?? "#FFFFFF"}
              onChange={(v) => onChange({ headline_color: v })} />
          </div>
        </Section>
      )}

      {showInstagram && (
        <Section title="Header Instagram" description="Avatar, @ e caption" collapsible defaultOpen={false}>
          <div className="space-y-3">
            <ColorField label={t("common.background")} value={compose.ig_bg_color ?? "#FFFFFF"}
              onChange={(v) => onChange({ ig_bg_color: v })} />
            <ColorField label={t("common.text")} value={compose.ig_text_color ?? "#141414"}
              onChange={(v) => onChange({ ig_text_color: v })} />
            <RangeField label="Avatar" min={48} max={96} value={compose.ig_avatar_size ?? 72}
              onChange={(v) => onChange({ ig_avatar_size: v })} unit="px" />
            <RangeField label="@usuario" min={22} max={48} value={compose.ig_username_size ?? 34}
              onChange={(v) => onChange({ ig_username_size: v })} unit="px" />
            <RangeField label="Caption" min={18} max={40} value={compose.ig_caption_size ?? 28}
              onChange={(v) => onChange({ ig_caption_size: v })} unit="px" />
          </div>
        </Section>
      )}

      {showOverlayCrop && (
        <Section title="Enquadramento mídia" description="Arraste no preview ou ajuste aqui" collapsible defaultOpen={false}>
          <div className="space-y-3">
            <RangeField label="Crop X" min={0} max={100} value={Math.round((compose.overlay_pos_x ?? 0.5) * 100)}
              onChange={(v) => onChange({ overlay_pos_x: v / 100 })} unit="%" />
            <RangeField label="Crop Y" min={0} max={100} value={Math.round((compose.overlay_pos_y ?? 0.5) * 100)}
              onChange={(v) => onChange({ overlay_pos_y: v / 100 })} unit="%" />
          </div>
        </Section>
      )}

      {showProgress && compose.progress_enabled && (
        <Section title="Barra de progresso" collapsible defaultOpen>
          <div className="space-y-3">
            <ColorField label={t("common.color")} value={compose.progress_color ?? "#E31B23"}
              onChange={(v) => onChange({ progress_color: v })} />
            <RangeField label={t("common.height")} min={2} max={12}
              value={Math.round(clampProgressHeightPct(compose.progress_height_pct) * 100)}
              onChange={(v) => onChange({ progress_height_pct: clampProgressHeightPct(v / 100) })} unit="%" />
          </div>
        </Section>
      )}
    </div>
  );
}
