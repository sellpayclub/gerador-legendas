"use client";

import type { ClipSegment } from "@/lib/api";

type Props = {
  clip: ClipSegment | null;
  onChange: (clip: ClipSegment) => void;
};

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    const mins = parseInt(m, 10);
    const secs = parseFloat(s);
    if (Number.isNaN(mins) || Number.isNaN(secs)) return null;
    return mins * 60 + secs;
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

export default function ClipBoundsEditor({ clip, onChange }: Props) {
  if (!clip) {
    return (
      <div className="border-t border-border bg-panel/80 p-4 text-xs text-zinc-500">
        Selecione um corte na lista acima para ajustar início e fim.
      </div>
    );
  }

  const setField = (field: "start_s" | "end_s", raw: string) => {
    const val = parseTime(raw);
    if (val === null || val < 0) return;
    const next = { ...clip, [field]: Math.round(val * 10) / 10 };
    next.duration_s = Math.max(0, next.end_s - next.start_s);
    onChange(next);
  };

  const setTitle = (title: string) => onChange({ ...clip, title });

  return (
    <div className="border-t border-accent/20 bg-accent/[0.03] p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
        Ajustar corte selecionado
      </h4>
      <label className="mb-2 block text-xs text-zinc-400">
        Título
        <input
          type="text"
          value={clip.title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-zinc-100"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-400">
          Início (m:ss)
          <input
            type="text"
            defaultValue={fmtTime(clip.start_s)}
            key={`start-${clip.id}-${clip.start_s}`}
            onBlur={(e) => setField("start_s", e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm tabular-nums text-zinc-100"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Fim (m:ss)
          <input
            type="text"
            defaultValue={fmtTime(clip.end_s)}
            key={`end-${clip.id}-${clip.end_s}`}
            onBlur={(e) => setField("end_s", e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm tabular-nums text-zinc-100"
          />
        </label>
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Duração: {Math.floor(clip.duration_s / 60)}:
        {Math.round(clip.duration_s % 60).toString().padStart(2, "0")} — ideal: 1–3 min
      </p>
    </div>
  );
}
