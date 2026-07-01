"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
import type { ClipSegment } from "@/lib/api";

type Props = {
  clips: ClipSegment[];
  activeId: string | null;
  detecting: boolean;
  onDetect: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (clip: ClipSegment) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
};

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ClipListPanel({
  clips,
  activeId,
  detecting,
  onDetect,
  onSelect,
  onToggle,
  onRemove,
  onPreview,
  onReorder,
}: Props) {
  const enabledCount = clips.filter((c) => c.enabled).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Cortes sugeridos</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Trechos com hook, insight e conclusão — ajuste início/fim se precisar
          </p>
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          className="flex shrink-0 items-center gap-1 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {detecting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {detecting ? "Detectando..." : "Detectar com IA"}
        </button>
      </div>

      {clips.length === 0 && !detecting && (
        <p className="rounded-lg border border-dashed border-border bg-panel/50 px-4 py-6 text-center text-xs text-zinc-500">
          Clique em &ldquo;Detectar com IA&rdquo; para encontrar os melhores trechos do vídeo.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {clips.map((clip, idx) => {
          const active = clip.id === activeId;
          return (
            <li
              key={clip.id}
              className={`rounded-lg border p-3 transition ${
                active
                  ? "border-accent/50 bg-accent/5"
                  : "border-border bg-panel/50 hover:border-border/80"
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={clip.enabled}
                  onChange={() => onToggle(clip.id)}
                  className="mt-1 shrink-0 accent-accent"
                  title="Incluir na exportação"
                />
                <button
                  type="button"
                  onClick={() => onSelect(clip.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="text-sm font-medium text-zinc-100">{clip.title}</div>
                  {(clip.insight || clip.hook) && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                      {clip.insight || clip.hook}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                    <span>{fmtDuration(clip.duration_s)}</span>
                    <span>·</span>
                    <span>
                      {clip.start_s.toFixed(0)}s – {clip.end_s.toFixed(0)}s
                    </span>
                    {clip.score != null && clip.score >= 0.75 && (
                      <>
                        <span>·</span>
                        <span className="text-accent">{(clip.score * 100).toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onReorder(clip.id, "up")}
                    disabled={idx === 0}
                    title="Mover para cima"
                    className="rounded p-0.5 text-zinc-500 hover:bg-border/50 hover:text-zinc-100 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorder(clip.id, "down")}
                    disabled={idx === clips.length - 1}
                    title="Mover para baixo"
                    className="rounded p-0.5 text-zinc-500 hover:bg-border/50 hover:text-zinc-100 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreview(clip)}
                    title="Ouvir trecho"
                    className="rounded p-1 text-zinc-400 hover:bg-border/50 hover:text-zinc-100"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(clip.id)}
                    title="Remover corte"
                    className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {clips.length > 0 && (
        <p className="text-xs text-zinc-500">
          {enabledCount} de {clips.length} selecionado(s) para exportar
        </p>
      )}
    </div>
  );
}
