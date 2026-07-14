"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, Scissors, Type } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadVideo, deleteJob, getHealth, getMe, listJobs, type JobState, type MeProfile } from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import HintBanner from "@/components/ui/HintBanner";
import AppTopNav from "@/components/AppTopNav";
import RecentJobsPanel from "@/components/RecentJobsPanel";
import Field from "@/components/ui/Field";
import { inputClass } from "@/components/ui/inputClass";
import { useI18n } from "@/lib/i18n/context";

const ACCEPTED = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"];

type AppMode = "legendas" | "cortes";

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobState[]>([]);
  const [language, setLanguage] = useState("auto");
  const [mode, setMode] = useState<AppMode>("legendas");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [me, setMe] = useState<MeProfile | null>(null);
  const [hosted, setHosted] = useState(false);
  const languageRef = useRef("auto");
  const modeRef = useRef<AppMode>("legendas");
  languageRef.current = language;
  modeRef.current = mode;

  const audioLanguages = [
    { value: "auto", label: t("home.languages.auto") },
    { value: "pt", label: t("home.languages.pt") },
    { value: "en", label: t("home.languages.en") },
    { value: "es", label: t("home.languages.es") },
    { value: "fr", label: t("home.languages.fr") },
    { value: "it", label: t("home.languages.it") },
    { value: "de", label: t("home.languages.de") },
  ];

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const d = await listJobs();
      setRecentJobs(d.jobs ?? []);
    } catch {
      /* ignore */
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const onFocus = () => loadJobs();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadJobs]);

  useEffect(() => {
    const mt = isMultiTenant();
    setHosted(mt);
    getHealth()
      .then((h) => {
        if (h.multi_tenant) {
          setHosted(true);
          return getMe()
            .then((profile) => {
              setMe(profile);
              setNeedsConfig(!profile.openai_configured);
            })
            .catch(() => setNeedsConfig(true));
        }
        setNeedsConfig(!h.openai_configured);
      })
      .catch(() => setNeedsConfig(false));
  }, []);

  const handleDelete = useCallback(
    async (jobId: string) => {
      if (!confirm(t("home.deleteConfirm"))) {
        return;
      }
      setDeletingId(jobId);
      try {
        await deleteJob(jobId);
        setRecentJobs((jobs) => jobs.filter((j) => j.id !== jobId));
      } catch (err) {
        alert("Erro no frontend ao apagar: " + String(err));
        await loadJobs();
      } finally {
        setDeletingId(null);
      }
    },
    [loadJobs, t],
  );

  const uploadBlocked =
    (hosted && me && !me.access_active) || needsConfig;

  const handleFile = useCallback(
    async (file: File) => {
      if (uploadBlocked) {
        setError(
          hosted && me && !me.access_active
            ? t("home.errorPlanInactive")
            : t("home.errorConfigureOpenAi"),
        );
        return;
      }
      setError(null);
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        setError(t("home.errorUnsupportedFormat", { ext, formats: ACCEPTED.join(", ") }));
        return;
      }
      setUploading(true);
      setProgress(0);
      try {
        const job = await uploadVideo(
          file,
          languageRef.current,
          modeRef.current,
          (pct) => setProgress(pct),
        );
        setProgress(100);
        router.push(modeRef.current === "cortes" ? `/cortes/${job.id}` : `/editor/${job.id}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t("home.errorUploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [router, uploadBlocked, hosted, me, t],
  );

  return (
    <main className="flex flex-col items-center py-10 sm:py-14">
      <AppTopNav maxWidth="max-w-2xl" />

      {hosted && me && !me.access_active && (
        <Link
          href="/plano-inativo"
          className="mb-4 w-full max-w-2xl rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          {t("home.planInactiveBanner")}
        </Link>
      )}

      {hosted && (
        <HintBanner className="mb-4 w-full max-w-2xl">
          {t("home.hostedRetentionHint", { hours: me?.job_max_age_hours ?? 24 })}
        </HintBanner>
      )}

      {needsConfig && (
        <div className="mb-6 w-full max-w-2xl space-y-2">
          <Link
            href="/configuracoes"
            className="block rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 transition hover:border-amber-400/60"
          >
            {t("home.configureOpenAiBanner")}
          </Link>
          {hosted && (
            <Link
              href="/aulas"
              className="block rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-zinc-200 transition hover:border-accent/50"
            >
              {t("home.lessonsHintBanner")}
            </Link>
          )}
        </div>
      )}

      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("home.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("home.subtitle")}</p>
      </div>

      <div className="mb-6 w-full max-w-2xl space-y-4">
        <Field label={t("home.modeLabel")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("legendas")}
              disabled={uploading}
              className={`touch-target flex flex-col items-start gap-2 rounded-xl border px-4 py-4 text-left transition ${
                mode === "legendas"
                  ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                  : "border-border bg-panel hover:border-zinc-600"
              }`}
            >
              <Type className={`h-6 w-6 ${mode === "legendas" ? "text-accent" : "text-zinc-400"}`} />
              <div>
                <div className={`text-sm font-semibold ${mode === "legendas" ? "text-accent" : "text-zinc-200"}`}>
                  {t("home.modeSubtitlesTitle")}
                </div>
                <p className="mt-0.5 text-xs text-muted">{t("home.modeSubtitlesDesc")}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("cortes")}
              disabled={uploading}
              className={`touch-target flex flex-col items-start gap-2 rounded-xl border px-4 py-4 text-left transition ${
                mode === "cortes"
                  ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                  : "border-border bg-panel hover:border-zinc-600"
              }`}
            >
              <Scissors className={`h-6 w-6 ${mode === "cortes" ? "text-accent" : "text-zinc-400"}`} />
              <div>
                <div className={`text-sm font-semibold ${mode === "cortes" ? "text-accent" : "text-zinc-200"}`}>
                  {t("home.modeClipsTitle")}
                </div>
                <p className="mt-0.5 text-xs text-muted">{t("home.modeClipsDesc")}</p>
              </div>
            </button>
          </div>
        </Field>

        <Field
          label={t("home.audioLanguageLabel")}
          hint={mode === "cortes" ? t("home.audioLanguageHintClips") : undefined}
        >
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={uploading}
            className={inputClass}
          >
            {audioLanguages.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`w-full max-w-2xl rounded-2xl border-2 border-dashed p-10 text-center transition sm:p-14 ${
          uploadBlocked
            ? "cursor-not-allowed border-border/60 bg-panel/50 opacity-60"
            : dragging
            ? "border-accent bg-accent/10 shadow-[0_0_32px_rgba(250,204,21,0.12)]"
            : "border-border bg-panel hover:border-zinc-600"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
            <div className="text-sm text-zinc-300">
              {progress !== null
                ? t("home.uploadSendingProgress", { progress })
                : t("home.uploadSending")}
            </div>
            {progress !== null && (
              <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !uploadBlocked && inputRef.current?.click()}
            disabled={uploadBlocked}
            className="flex w-full flex-col items-center gap-4 disabled:cursor-not-allowed"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/25">
              <Upload className="h-8 w-8 text-accent" />
            </div>
            <div className="text-lg font-medium text-zinc-100">{t("home.uploadDrag")}</div>
            <div className="text-sm text-muted">{t("home.uploadFormats")}</div>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 w-full max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {recentJobs.length > 0 && (
        <RecentJobsPanel
          jobs={recentJobs}
          deletingId={deletingId}
          onDelete={handleDelete}
          onRefresh={loadJobs}
          loading={jobsLoading}
        />
      )}
    </main>
  );
}
