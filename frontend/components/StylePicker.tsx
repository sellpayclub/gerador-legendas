"use client";

import { useEffect, useState } from "react";
import { listPresets, type StyleConfig } from "@/lib/api";

type Props = {
  style: StyleConfig;
  onChange: (s: StyleConfig) => void;
  wordsPerLine: number;
  onWordsPerLineChange: (n: number) => void;
  videoHeight: number;
  videoWidth: number;
  position: { x: number | null; y: number | null };
  onPositionChange: (pos: { x: number | null; y: number | null }) => void;
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
}: Props) {
  const [presets, setPresets] = useState<{ id: string; name: string; values: any }[]>([]);

  useEffect(() => {
    listPresets().then((d) => setPresets(d.presets ?? [])).catch(() => {});
  }, []);

  const set = (patch: Partial<StyleConfig>) => onChange({ ...style, ...patch });

  const letterSpacing = style.letter_spacing ?? 2;
  const wordSpacing = style.word_spacing ?? 4;
  const posY = position.y ?? videoHeight - style.margin_v;

  const applyPreset = (values: any) => {
    onChange({ ...style, ...values });
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Presets</h3>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.values)}
              className="rounded-lg border border-border bg-panel px-3 py-2 text-left text-sm hover:border-accent/50"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-[10px] text-zinc-500">Clique para aplicar</div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipografia</h3>
        <Field label="Fonte">
          <select
            value={style.font}
            onChange={(e) => set({ font: e.target.value })}
            className="input"
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
            min={Math.round(videoHeight * 0.15)}
            max={Math.round(videoHeight * 0.95)}
            value={Math.round(posY)}
            onChange={(e) => {
              const y = +e.target.value;
              onPositionChange({
                x: position.x ?? videoWidth / 2,
                y,
              });
            }}
            className="w-full"
          />
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
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cores</h3>
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
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Animação</h3>
        <div className="flex gap-2">
          {(["pop", "fade", "none"] as const).map((a) => (
            <button
              key={a}
              onClick={() => set({ animation: a })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                style.animation === a
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-panel text-zinc-300"
              }`}
            >
              {a === "pop" ? "Pop" : a === "fade" ? "Fade" : "Nenhuma"}
            </button>
          ))}
        </div>
        {style.animation === "pop" && (
          <Field label={`Escala do pop: ${style.pop_scale}%`}>
            <input
              type="range" min={105} max={150} value={style.pop_scale}
              onChange={(e) => set({ pop_scale: +e.target.value })}
              className="w-full"
            />
          </Field>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Caixa de fundo</h3>
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
      </section>

      <style jsx global>{`
        .input {
          width: 100%;
          background: #0a0a0b;
          border: 1px solid #26262b;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 14px;
          color: #e5e5e7;
        }
        .input:focus {
          outline: none;
          border-color: #facc15;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-zinc-400">{label}</div>
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-zinc-400">{label}</div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-xs text-zinc-300 outline-none"
        />
      </div>
    </label>
  );
}
