"use client";

import { Download, Loader2, Scissors } from "lucide-react";
import type { ClipSegment } from "@/lib/api";
import { clipOutputUrl } from "@/lib/api";

type Props = {
  jobId: string;
  clips: ClipSegment[];
  aspect: "original" | "vertical";
  onAspectChange: (a: "original" | "vertical") => void;
  onRenderOne: (clipId: string) => void;
  onRenderAll: () => void;
  renderingAll: boolean;
  renderingIds: Set<string>;
};

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ClipExportPanel({
  jobId,
  clips,
  aspect,
  onAspectChange,
  onRenderOne,
  onRenderAll,
  renderingAll,
  renderingIds,
}: Props) {
  const enabled = clips.filter((c) => c.enabled);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Exportar cortes</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Serão gerados <strong className="text-zinc-300">{enabled.length} arquivo(s) MP4</strong> —
          um por corte marcado, com legenda editada. O vídeo original completo{" "}
          <strong className="text-zinc-300">não</strong> é exportado.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">Formato de saída</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAspectChange("vertical")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              aspect === "vertical"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-zinc-400 hover:text-zinc-200"
            }`}
          >
            9:16 Vertical
          </button>
          <button
            type="button"
            onClick={() => onAspectChange("original")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              aspect === "original"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Original
          </button>
        </div>
      </div>

      {enabled.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-zinc-500">
          Nenhum corte selecionado. Volte à etapa 1 e marque os cortes desejados.
        </p>
      )}

      <ul className="space-y-2">
        {enabled.map((clip) => {
          const busy = renderingIds.has(clip.id) || clip.status === "rendering";
          const ready = clip.status === "done";
          const failed = clip.status === "error";
          return (
            <li
              key={clip.id}
              className="rounded-lg border border-border bg-panel/50 p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100">{clip.title}</div>
                  <div className="text-[10px] text-zinc-500">{fmtDuration(clip.duration_s)}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    ready
                      ? "bg-green-500/10 text-green-400"
                      : busy
                        ? "bg-accent/10 text-accent"
                        : failed
                          ? "bg-red-500/10 text-red-400"
                          : "bg-border text-zinc-500"
                  }`}
                >
                  {ready ? "Pronto" : busy ? "Gerando..." : failed ? "Erro" : "Pendente"}
                </span>
              </div>
              {failed && clip.error && (
                <p className="mb-2 text-[10px] text-red-400">{clip.error}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {!ready && (
                  <button
                    type="button"
                    onClick={() => onRenderOne(clip.id)}
                    disabled={busy || renderingAll}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Scissors className="h-3.5 w-3.5" />
                    )}
                    Gerar este corte
                  </button>
                )}
                {ready && (
                  <>
                    <video
                      src={clipOutputUrl(jobId, clip.id)}
                      controls
                      className="mb-2 w-full rounded-lg bg-black"
                    />
                    <a
                      href={clipOutputUrl(jobId, clip.id)}
                      download={`corte_${clip.title.replace(/[^\w\s-]/g, "").slice(0, 40)}.mp4`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Baixar MP4
                    </a>
                    <button
                      type="button"
                      onClick={() => onRenderOne(clip.id)}
                      disabled={busy || renderingAll}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                    >
                      Re-gerar
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {enabled.length > 1 && (
        <button
          type="button"
          onClick={onRenderAll}
          disabled={renderingAll || renderingIds.size > 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/5 py-2.5 text-sm font-medium text-accent disabled:opacity-50"
        >
          {renderingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Scissors className="h-4 w-4" />
          )}
          Gerar todos selecionados ({enabled.length})
        </button>
      )}
    </div>
  );
}
