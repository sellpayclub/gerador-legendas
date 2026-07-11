"use client";

import { useEffect, useState } from "react";
import { listPresets, type StyleConfig, type Word } from "@/lib/api";
import KaraokeLine from "@/components/KaraokeLine";
import { hexWithAlpha } from "@/lib/colorAlpha";
import Section from "@/components/ui/Section";
import { inputClass } from "@/components/ui/inputClass";
import { clampSubtitlePosition } from "@/lib/subtitlePosition";

const PRESET_SAMPLE_WORDS: Word[] = [
  { w: "sua", start: 0, end: 0.35 },
  { w: "legenda", start: 0.35, end: 0.7 },
  { w: "aqui", start: 0.7, end: 1.05 },
];

const STYLE_DEFAULTS: StyleConfig = {
  font: "Roboto",
  font_size: 72,
  text_case: "normal",
  pause_threshold_s: 0.45,
  primary_color: "#FACC15",
  secondary_color: "#FFFFFF",
  outline_color: "#000000",
  outline_width: 8,
  shadow: 0,
  bold: true,
  italic: false,
  animation: "pop",
  pop_scale: 115,
  pop_duration_ms: 120,
  box: false,
  box_color: "#000000",
  box_opacity: 0.5,
  pos_x: null,
  pos_y: null,
  margin_v: 120,
  letter_spacing: 2,
  word_spacing: 4,
  keyword_scale: 180,
};

function PresetPreview({ values }: { values: Partial<StyleConfig> }) {
  const style = { ...STYLE_DEFAULTS, ...values };
  const scaleY = 0.19;
  return (
    <div className="flex min-h-[54px] items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-zinc-800/90 to-zinc-950 px-2 py-2">
      <span
        style={{
          padding: style.box ? "0.12em 0.45em" : "0",
          background: style.box
            ? hexWithAlpha(style.box_color, style.box_opacity ?? 0.5)
            : "transparent",
          borderRadius: style.box ? "5px" : "0",
          display: "inline-block",
          maxWidth: "100%",
        }}
      >
        <KaraokeLine
          words={PRESET_SAMPLE_WORDS}
          style={style}
          scaleY={scaleY}
          activeIndex={1}
        />
      </span>
    </div>
  );
}

type Props = {
  style: StyleConfig;
  onChange: (s: StyleConfig) => void;
  wordsPerLine: number;
  onWordsPerLineChange: (n: number) => void;
  videoHeight: number;
  videoWidth: number;
  position: { x: number | null; y: number | null };
  onPositionChange: (pos: { x: number | null; y: number | null }) => void;
  defaultPosition?: { x: number; y: number };
};

const FONTS = ["Roboto", "Open Sans", "Lato", "Raleway", "Inter", "Montserrat"] as const;

export default function StylePicker({
  style,
  onChange,
  wordsPerLine,
  onWordsPerLineChange,
  videoHeight,
  videoWidth,
  position,
  onPositionChange,
  defaultPosition,
}: Props) {
  const [presets, setPresets] = useState<{ id: string; name: string; values: any }[]>([]);

  useEffect(() => {
    listPresets().then((d) => setPresets(d.presets ?? [])).catch(() => {});
  }, []);

  const set = (patch: Partial<StyleConfig>) => onChange({ ...style, ...patch });

  const letterSpacing = style.letter_spacing ?? 2;
  const wordSpacing = style.word_spacing ?? 4;
  const marginV = style.margin_v ?? 120;
  const clampedPos = clampSubtitlePosition(position, videoWidth, videoHeight, marginV);
  const posY = clampedPos.y;
  const sliderMin = Math.round(videoHeight * 0.08);
  const sliderMax = Math.round(videoHeight * 0.92);

  const resetPosition = () => {
    const def = defaultPosition ?? { x: videoWidth / 2, y: videoHeight - marginV };
    onPositionChange(def);
    onChange({ ...style, pos_x: def.x, pos_y: def.y });
  };

  const applyPreset = (values: any) => {
    onChange({ ...style, ...values });
  };

  return (
    <div className="space-y-4">
      <Section title="Presets" description="Estilos prontos — clique para aplicar">
        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.values)}
              className="touch-target rounded-lg border border-border bg-panel p-2 text-left transition hover:border-accent/50"
            >
              <PresetPreview values={p.values} />
              <div className="mt-1.5 truncate text-xs font-medium text-zinc-200">{p.name}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tipografia" collapsible defaultOpen>
        <div className="space-y-3">
        <Field label="Fonte">
          <select
            value={style.font}
            onChange={(e) => set({ font: e.target.value })}
            className={inputClass}
          >
            {FONTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Field>
        <Field label="Caixa">
          <div className="flex gap-2">
            {([
              ["normal", "Normal"],
              ["upper", "MAIÚSCULAS"],
              ["lower", "minúsculas"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ text_case: value })}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs ${
                  (style.text_case ?? "normal") === value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-panel text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Tamanho: ${style.font_size}px`}>
          <input
            type="range" min={20} max={160} value={style.font_size}
            onChange={(e) => set({ font_size: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Palavras por linha (máx.): ${wordsPerLine}`}>
          <input
            type="range" min={1} max={8} value={wordsPerLine}
            onChange={(e) => onWordsPerLineChange(+e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={`Sensibilidade de pausa: ${(style.pause_threshold_s ?? 0.45).toFixed(2)}s`}>
          <input
            type="range"
            min={0.25}
            max={0.8}
            step={0.05}
            value={style.pause_threshold_s ?? 0.45}
            onChange={(e) => set({ pause_threshold_s: +e.target.value })}
            className="w-full"
          />
          <p className="mt-1 text-[10px] text-zinc-500">
            Quebra a linha quando há silêncio maior que este valor. Menor = mais sensível.
          </p>
        </Field>
        <Field label={`Espaçamento de letras: ${letterSpacing}px`}>
          <input
            type="range" min={0} max={20} value={letterSpacing}
            onChange={(e) => set({ letter_spacing: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Espaçamento de palavras: ${wordSpacing}px`}>
          <input
            type="range" min={0} max={40} value={wordSpacing}
            onChange={(e) => set({ word_spacing: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Altura (posição Y): ${Math.round(posY)}px`}>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            value={Math.round(posY)}
            onChange={(e) => {
              const y = +e.target.value;
              onPositionChange({
                x: clampedPos.x,
                y,
              });
              onChange({ ...style, pos_x: clampedPos.x, pos_y: y });
            }}
            className="w-full"
          />
          <button
            type="button"
            onClick={resetPosition}
            className="mt-2 w-full rounded-lg border border-border bg-panel px-3 py-2 text-xs text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100"
          >
            Resetar posição da legenda
          </button>
        </Field>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={style.bold}
              onChange={(e) => set({ bold: e.target.checked })}
            />
            Negrito
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={style.italic}
              onChange={(e) => set({ italic: e.target.checked })}
            />
            Itálico
          </label>
        </div>
        </div>
      </Section>

      <Section title="Cores" collapsible defaultOpen>
        <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <ColorField label="Highlight" value={style.primary_color} onChange={(v) => set({ primary_color: v })} />
          <ColorField label="Base" value={style.secondary_color} onChange={(v) => set({ secondary_color: v })} />
          <ColorField label="Contorno" value={style.outline_color} onChange={(v) => set({ outline_color: v })} />
        </div>
        <Field label={`Espessura contorno: ${style.outline_width}px`}>
          <input
            type="range" min={0} max={24} value={style.outline_width}
            onChange={(e) => set({ outline_width: +e.target.value })}
            className="w-full"
          />
        </Field>
        </div>
      </Section>

      <Section title="Animação" collapsible defaultOpen={false}>
        <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {([
            ["pop", "Pop"],
            ["bounce", "Bounce"],
            ["slide", "Slide"],
            ["fade", "Fade"],
            ["none", "Nenhuma"],
          ] as const).map(([a, label]) => (
            <button
              key={a}
              type="button"
              onClick={() => set({ animation: a })}
              className={`rounded-lg border px-3 py-2 text-sm ${
                style.animation === a
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-panel text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {(style.animation === "pop" || style.animation === "bounce") && (
          <Field label={`Escala: ${style.pop_scale}%`}>
            <input
              type="range" min={105} max={150} value={style.pop_scale}
              onChange={(e) => set({ pop_scale: +e.target.value })}
              className="w-full"
            />
          </Field>
        )}
        {(style.animation === "bounce" || style.animation === "slide") && (
          <Field label={`Duração: ${style.pop_duration_ms}ms`}>
            <input
              type="range" min={60} max={300} step={10} value={style.pop_duration_ms}
              onChange={(e) => set({ pop_duration_ms: +e.target.value })}
              className="w-full"
            />
          </Field>
        )}
        </div>
      </Section>

      <Section title="Caixa de fundo" collapsible defaultOpen={false}>
        <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox" checked={style.box}
            onChange={(e) => set({ box: e.target.checked })}
          />
          Mostrar caixa atrás do texto
        </label>
        {style.box && (
          <>
            <ColorField label="Cor da caixa" value={style.box_color} onChange={(v) => set({ box_color: v })} />
            <Field label={`Opacidade: ${Math.round(style.box_opacity * 100)}%`}>
              <input
                type="range" min={0} max={1} step={0.05} value={style.box_opacity}
                onChange={(e) => set({ box_opacity: +e.target.value })}
                className="w-full"
              />
            </Field>
          </>
        )}
        </div>
      </Section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="label">{label}</div>
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="label">{label}</div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-sm text-zinc-300 outline-none"
        />
      </div>
    </label>
  );
}
