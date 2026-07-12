"use client";

import { Download, Loader2, Pencil } from "lucide-react";
import type { ClipSegment, ExportFormatId } from "@/lib/api";
import { clipOutputUrl } from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import { useAccessToken } from "@/lib/useAccessToken";
import { FORMAT_OPTIONS } from "@/components/ClipFormatPicker";

type Props = {
  jobId: string;
  clips: ClipSegment[];
  format: ExportFormatId;
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
  format,
  onRenderOne,
  onRenderAll,
  renderingAll,
  renderingIds,
  onEditFormat,
}: Props) {
  const accessToken = useAccessToken();
  const hosted = isMultiTenant();
  const canDownload = !hosted || Boolean(accessToken);
  const enabled = clips.filter((c) => c.enabled);
  const formatLabel = FORMAT_OPTIONS.find((f) => f.id === format)?.label ?? format;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">{t("cortes.export.title")}</h3>
        <p className="mt-1 text-sm text-muted">
          {t("cortes.export.desc1")} <strong className="text-zinc-300">{enabled.length} {t("cortes.export.desc2")}</strong> {t("cortes.export.desc3")}{" "}
          <strong className="text-zinc-300">{t("cortes.export.notExported")}</strong> {t("cortes.export.desc4")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-panel/50 px-4 py-3">
        <div>
          <p className="label mb-0">{t("cortes.export.format")}</p>
          <p className="text-sm font-medium text-zinc-200">{formatLabel}</p>
        </div>
        <button
          type="button"
          onClick={onEditFormat}
          className="touch-target flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-zinc-400 hover:border-accent/40 hover:text-accent"
        >
          <Pencil className="h-4 w-4" />
          Alterar
        </button>
      </div>

      {enabled.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          Nenhum corte selecionado. Volte à etapa 1 e marque os cortes desejados.
        </p>
      )}

      <ul className="space-y-3">
        {enabled.map((clip) => {
          const busy = renderingIds.has(clip.id) || clip.status === "rendering";
          const ready = clip.status === "done";
          const failed = clip.status === "error";
          return (
            <li
              key={clip.id}
              className="rounded-xl border border-border bg-panel/50 p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100">{clip.title}</div>
                  <div className="text-xs text-muted">{fmtDuration(clip.duration_s)}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
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
                <p className="mb-2 text-sm text-red-400">{clip.error}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {!ready && (
                  <button
                    type="button"
                    onClick={() => onRenderOne(clip.id)}
                    disabled={busy || renderingAll}
                    className="touch-target flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Gerar MP4
                  </button>
                )}
                {ready && canDownload && (
                  <a
                    href={clipOutputUrl(jobId, clip.id, accessToken)}
                    download
                    className="touch-target flex items-center gap-2 rounded-lg bg-green-500/20 px-4 py-2.5 text-sm font-semibold text-green-300"
                  >
                    <Download className="h-4 w-4" />
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
          className="touch-target flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-bg disabled:opacity-50"
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
