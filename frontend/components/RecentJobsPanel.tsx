"use client";

import { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Film,
  Loader2,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { JobState } from "@/lib/api";
import { outputUrl } from "@/lib/api";
import { useAccessToken } from "@/lib/useAccessToken";
import { isMultiTenant } from "@/lib/hosted";
import {
  filterJobsList,
  formatDuration,
  formatExactTime,
  formatRelativeTime,
  jobModeLabel,
  jobStatus,
  sortJobs,
  statusBadgeClass,
  type JobFilter,
} from "@/lib/jobDisplay";
import { useI18n } from "@/lib/i18n/context";
import IconButton from "@/components/ui/IconButton";

type Props = {
  jobs: JobState[];
  deletingId: string | null;
  onDelete: (jobId: string) => void;
  onRefresh: () => void;
  loading?: boolean;
};

function jobRoute(j: JobState): string {
  return j.mode === "cortes" ? `/cortes/${j.id}` : `/editor/${j.id}`;
}

export default function RecentJobsPanel({
  jobs,
  deletingId,
  onDelete,
  onRefresh,
  loading = false,
}: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const accessToken = useAccessToken();
  const hosted = isMultiTenant();
  const canDownload = !hosted || Boolean(accessToken);
  const [filter, setFilter] = useState<JobFilter>("all");

  const filters: { id: JobFilter; label: string }[] = [
    { id: "all", label: t("projects.filterAll") },
    { id: "ready", label: t("projects.filterReady") },
    { id: "progress", label: t("projects.filterProgress") },
  ];

  const visible = useMemo(() => filterJobsList(sortJobs(jobs), filter), [jobs, filter]);

  if (jobs.length === 0) return null;

  return (
    <section className="mt-12 w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{t("projects.title")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("projects.subtitle", { count: jobs.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("projects.refresh")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => {
          const count = filterJobsList(sortJobs(jobs), f.id).length;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-panel text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-panel/50 px-4 py-8 text-center text-sm text-muted">
          {t("projects.emptyFilter")}
        </div>
      ) : (
        <ul className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto pr-1">
          {visible.map((j) => {
            const status = jobStatus(j, t);
            const when = formatRelativeTime(j.updated_at ?? j.created_at, t, locale);
            const exact = formatExactTime(j.updated_at ?? j.created_at, locale);
            const isBusy = ["transcribing", "rendering", "generating_ass", "extracting_audio"].includes(
              j.stage,
            );

            return (
              <li key={j.id}>
                <article className="rounded-xl border border-border bg-panel p-4 transition hover:border-accent/35">
                  <div className="flex gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        j.mode === "cortes" ? "bg-violet-500/10 text-violet-300" : "bg-accent/10 text-accent"
                      }`}
                    >
                      {j.mode === "cortes" ? (
                        <Scissors className="h-5 w-5" />
                      ) : (
                        <Film className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-zinc-100" title={j.filename}>
                            {j.filename}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-zinc-300">
                              {jobModeLabel(j.mode, t)}
                            </span>
                            <span>{formatDuration(j.duration, t)}</span>
                            {j.clip_count ? (
                              <span>{t("projects.clipCount", { count: j.clip_count })}</span>
                            ) : null}
                            {when ? <span title={exact}>· {when}</span> : null}
                          </div>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status.tone)}`}
                        >
                          {isBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                          {status.label}
                          {status.hint ? <span className="opacity-80">· {status.hint}</span> : null}
                        </span>
                      </div>

                      {isBusy && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${Math.max(4, Math.round((j.progress ?? 0) * 100))}%` }}
                          />
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(jobRoute(j))}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-medium text-accent ring-1 ring-accent/25 transition hover:bg-accent/25"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {j.has_output || j.has_words ? t("projects.continue") : t("projects.open")}
                        </button>

                        {j.has_output && j.mode !== "cortes" && canDownload && (
                          <a
                            href={outputUrl(j.id, accessToken)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/40 hover:text-emerald-200"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t("common.downloadMp4")}
                          </a>
                        )}

                        {j.stage === "done" && j.has_output && j.mode !== "cortes" && (
                          <button
                            type="button"
                            onClick={() => router.push(`/render/${j.id}`)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-zinc-400 transition hover:text-zinc-200"
                          >
                            {t("projects.viewRender")}
                          </button>
                        )}

                        <div className="ml-auto">
                          <IconButton
                            variant="danger"
                            onClick={() => onDelete(j.id)}
                            disabled={deletingId === j.id}
                            title={t("projects.deleteTitle")}
                            aria-label={t("projects.deleteTitle")}
                          >
                            {deletingId === j.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Trash2 className="h-5 w-5" />
                            )}
                          </IconButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
