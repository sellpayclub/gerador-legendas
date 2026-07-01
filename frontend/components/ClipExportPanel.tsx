"use client";

import { Download, Loader2, Pencil } from "lucide-react";
import type { ClipSegment } from "@/lib/api";
import { clipOutputUrl } from "@/lib/api";

type Props = {
  jobId: string;
  clips: ClipSegment[];
  aspect: "original" | "vertical";
  onRenderOne: (clipId: string) => void;
  onRenderAll: () => void;
  renderingAll: boolean;
  renderingIds: Set<string>;
  onEditFormat: () => void;
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
  onRenderOne,
  onRenderAll,
  renderingAll,
  renderingIds,
  onEditFormat,
}: Props) {
  const enabled = clips.filter((c) => c.enabled);
  const formatLabel = aspect === "vertical" ? "9:16 Vertical" : "Original";

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

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel/50 px-3 py-2.5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Formato</p>
          <p className="text-sm font-medium text-zinc-200">{formatLabel}</p>
        </div>
        <button
          type="button"
          onClick={onEditFormat}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-zinc-400 hover:border-accent/40 hover:text-accent"
        >
          <Pencil className="h-3 w-3" />
          Alterar
        </button>
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
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Gerar MP4
                  </button>
                )}
                {ready && (
                  <a
                    href={clipOutputUrl(jobId, clip.id)}
                    download
                    className="flex items-center gap-1.5 rounded-lg bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Baixar
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {enabled.length > 0 && (
        <button
          type="button"
          onClick={onRenderAll}
          disabled={renderingAll || enabled.some((c) => renderingIds.has(c.id))}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-bg disabled:opacity-50"
        >
          {renderingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando {enabled.length} MP4s...
            </>
          ) : (
            <>Gerar todos ({enabled.length})</>
          )}
        </button>
      )}
    </div>
  );
}
