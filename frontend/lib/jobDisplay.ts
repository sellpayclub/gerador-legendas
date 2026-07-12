import type { JobState } from "@/lib/api";

export type JobFilter = "all" | "ready" | "progress";

export type JobStatusInfo = {
  label: string;
  tone: "ready" | "progress" | "idle" | "error";
  hint?: string;
};

import type { Locale } from "@/lib/i18n/context";

type TFn = (key: string, params?: Record<string, string | number | undefined>) => string;

const DATE_LOCALE: Record<Locale, string> = { pt: "pt-BR", es: "es", en: "en-US" };

export function jobStatus(job: JobState, t: TFn): JobStatusInfo {
  if (job.stage === "error") {
    return { label: t("job.stage.error"), tone: "error", hint: job.message || undefined };
  }
  if (job.stage === "done" && job.has_output) {
    return { label: t("job.status.videoReady"), tone: "ready" };
  }
  if (job.stage === "done" && job.mode === "cortes" && job.clip_count) {
    return { label: t("job.status.clipCount", { count: job.clip_count }), tone: "ready" };
  }
  if (job.stage === "transcribed" || (job.stage === "done" && job.has_words)) {
    return {
      label: t("job.status.transcriptReady"),
      tone: "idle",
      hint: t("job.status.continueEditing"),
    };
  }
  if (job.stage === "rendering" || job.stage === "generating_ass") {
    const pct = Math.round((job.progress ?? 0) * 100);
    return {
      label: t(`job.stage.${job.stage}`),
      tone: "progress",
      hint: pct > 0 ? `${pct}%` : job.message || undefined,
    };
  }
  if (job.stage === "transcribing") {
    const pct = Math.round((job.progress ?? 0) * 100);
    return {
      label: t("job.stage.transcribing"),
      tone: "progress",
      hint: pct > 0 ? `${pct}%` : undefined,
    };
  }
  const stageKey = `job.stage.${job.stage}`;
  return {
    label: t(stageKey),
    tone: job.stage === "queued" ? "idle" : "progress",
    hint: job.message || undefined,
  };
}

export function formatDuration(seconds: number, t: TFn): string {
  if (!seconds || seconds < 1) return t("job.duration.lessThanOneMin");
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return t("job.duration.lessThanOneMin");
  if (totalMin < 60) return t("job.duration.minutes", { n: totalMin });
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? t("job.duration.hours", { h, m }) : `${h}h`;
}

export function formatRelativeTime(ts: number | undefined, t: TFn, locale: Locale): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return t("job.time.now");
  if (diff < 3600) return t("job.time.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("job.time.hoursAgo", { n: Math.floor(diff / 3600) });
  if (diff < 172800) return t("job.time.yesterday");
  return new Date(ts * 1000).toLocaleDateString(DATE_LOCALE[locale], {
    day: "2-digit",
    month: "short",
  });
}

export function formatExactTime(ts: number | undefined, locale: Locale): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString(DATE_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function jobModeLabel(mode: JobState["mode"] | undefined, t: TFn): string {
  return mode === "cortes" ? t("job.mode.clips") : t("job.mode.subtitles");
}

export function filterJobsList(jobs: JobState[], filter: JobFilter): JobState[] {
  if (filter === "all") return jobs;
  if (filter === "ready") {
    return jobs.filter(
      (j) =>
        (j.stage === "done" && j.has_output) ||
        (j.mode === "cortes" && (j.clip_count ?? 0) > 0 && j.has_words),
    );
  }
  return jobs.filter((j) =>
    ["transcribing", "rendering", "generating_ass", "extracting_audio", "queued"].includes(j.stage),
  );
}

export function sortJobs(jobs: JobState[]): JobState[] {
  return [...jobs].sort(
    (a, b) => (b.updated_at ?? b.created_at ?? 0) - (a.updated_at ?? a.created_at ?? 0),
  );
}

const TONE_CLASSES: Record<JobStatusInfo["tone"], string> = {
  ready: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  progress: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
  idle: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  error: "bg-red-500/15 text-red-300 ring-red-500/30",
};

export function statusBadgeClass(tone: JobStatusInfo["tone"]): string {
  return TONE_CLASSES[tone];
}
