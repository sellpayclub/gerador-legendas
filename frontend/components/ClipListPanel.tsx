"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
import type { ClipFocusType, ClipSegment } from "@/lib/api";
import IconButton from "@/components/ui/IconButton";

export const CLIP_FOCUS_OPTIONS: { id: ClipFocusType; label: string; desc: string }[] = [
  { id: "viral", label: "Viral", desc: "Ganchos fortes, apelo amplo (padrão)" },
  { id: "polemico", label: "Polêmicos", desc: "Opiniões fortes, debate" },
  { id: "engracado", label: "Engraçados", desc: "Humor, punchlines" },
  { id: "valioso", label: "Conteúdo valioso", desc: "Educativo, dicas práticas" },
  { id: "inspirador", label: "Inspirador", desc: "Motivação, mindset" },
  { id: "choque", label: "Choque", desc: "Fatos surpreendentes" },
];

type Props = {
  clips: ClipSegment[];
  activeId: string | null;
  detecting: boolean;
  transcribing?: boolean;
  onDetect: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (clip: ClipSegment) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  /** Focos editoriais selecionados antes de detectar (multi-seleção). */
  focuses?: ClipFocusType[];
  onFocusesChange?: (focuses: ClipFocusType[]) => void;
  /** Esconder o seletor depois da primeira detecção (quando já há cortes). */
  showFocusPicker?: boolean;
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
  transcribing = false,
  onDetect,
  onSelect,
  onToggle,
  onRemove,
  onPreview,
  onReorder,
  focuses = [],
  onFocusesChange,
  showFocusPicker = true,
}: Props) {
  const [focusOpen, setFocusOpen] = useState(false);
  const enabledCount = clips.filter((c) => c.enabled).length;
  const focusDisabled = detecting || transcribing;
  const selectedLabels = CLIP_FOCUS_OPTIONS
    .filter((o) => focuses.includes(o.id) && o.id !== "viral")
    .map((o) => o.label);
  const summary =
    selectedLabels.length > 0
      ? selectedLabels.join(", ")
      : "Viral (padrão)";

  const toggleFocus = (id: ClipFocusType) => {
    if (!onFocusesChange) return;
    if (id === "viral") {
      // viral é o padrão implícito — limpa os outros quando selecionado
      onFocusesChange([]);
      return;
    }
    const next = focuses.includes(id)
      ? focuses.filter((f) => f !== id)
      : [...focuses.filter((f) => f !== "viral"), id];
    onFocusesChange(next);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{t("cortes.clipList.title")}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {t("cortes.clipList.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={detecting || transcribing}
          title={transcribing ? "Aguarde a transcrição terminar" : undefined}
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

      {showFocusPicker && (
        <div className="rounded-lg border border-border bg-panel/50 p-2.5">
          <button
            type="button"
            onClick={() => setFocusOpen((v) => !v)}
            disabled={focusDisabled}
            className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-xs text-zinc-300 transition hover:text-zinc-100 disabled:opacity-50"
          >
            <span>
              <span className="text-zinc-500">Foco dos cortes: </span>
              <span className="font-medium text-zinc-100">{summary}</span>
            </span>
            {focusOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {focusOpen && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {CLIP_FOCUS_OPTIONS.map((opt) => {
                const active =
                  opt.id === "viral" ? focuses.length === 0 : focuses.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={focusDisabled}
                    onClick={() => toggleFocus(opt.id)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs transition disabled:opacity-50 ${
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span className="block font-medium">{opt.label}</span>
                    <span className="mt-0.5 block text-[10px] opacity-70">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!focusOpen && selectedLabels.length === 0 && (
            <p className="mt-1 px-1 text-[10px] text-zinc-500">
              Toque para escolher polêmicos, engraçados, conteúdo valioso e mais. Pode combinar vários.
            </p>
          )}
        </div>
      )}

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
