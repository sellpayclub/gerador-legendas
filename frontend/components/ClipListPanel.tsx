"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
import type { ClipSegment } from "@/lib/api";
import IconButton from "@/components/ui/IconButton";

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
            Marque os cortes · clique em «Ajustar corte» no fim da lista se quiser editar
          </p>
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          className="touch-target flex shrink-0 items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {detecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-zinc-100">{clip.title}</div>
                    {clip.edit_mode === "hook_then_body" && (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        Gancho imediato
                      </span>
                    )}
                  </div>
                  {(clip.hook_text || clip.insight || clip.hook) && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                      {clip.hook_text || clip.insight || clip.hook}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                    <span>{fmtDuration(clip.duration_s)}</span>
                    {clip.edit_mode === "hook_then_body" && clip.segments?.length ? (
                      <>
                        <span>·</span>
                        <span>
                          gancho {clip.segments.find((s) => s.role === "hook")?.start_s.toFixed(0)}s
                          {" → "}
                          corpo {clip.segments.find((s) => s.role === "body")?.start_s.toFixed(0)}s
                        </span>
                      </>
                    ) : (
                      <>
                        <span>·</span>
                        <span>
                          {clip.start_s.toFixed(0)}s – {clip.end_s.toFixed(0)}s
                        </span>
                      </>
                    )}
                    {clip.score != null && clip.score >= 0.62 && (
                      <>
                        <span>·</span>
                        <span className="text-accent">{(clip.score * 100).toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconButton
                    type="button"
                    onClick={() => onReorder(clip.id, "up")}
                    disabled={idx === 0}
                    title="Mover para cima"
                    size="sm"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    onClick={() => onReorder(clip.id, "down")}
                    disabled={idx === clips.length - 1}
                    title="Mover para baixo"
                    size="sm"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    onClick={() => onPreview(clip)}
                    title="Ouvir trecho"
                    size="sm"
                  >
                    <Play className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="danger"
                    onClick={() => onRemove(clip.id)}
                    title="Remover corte"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
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
