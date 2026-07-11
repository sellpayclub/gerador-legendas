"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, CheckCircle2, Plus } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getJob, outputUrl, type JobState } from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import { useAccessToken } from "@/lib/useAccessToken";
import { useJobEvents } from "@/lib/useJobEvents";
import { useI18n } from "@/lib/i18n/context";

export default function RenderPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;
  const accessToken = useAccessToken();
  const { t } = useI18n();

  const [initial, setInitial] = useState<JobState | null>(null);
  const { job } = useJobEvents(jobId, true);

  useEffect(() => {
    getJob(jobId).then(setInitial).catch(() => {});
  }, [jobId]);

  const current = job ?? initial;
  const done = current?.stage === "done";
  const error = current?.stage === "error";
  const hosted = isMultiTenant();
  const outputSrc =
    hosted && !accessToken ? null : outputUrl(jobId, accessToken);

  return (
    <main className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push(`/editor/${jobId}`)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> {t("render.backToEditor")}
        </button>
        <LanguageSwitcher compact />
      </div>

      <h1 className="text-2xl font-bold">{t("render.title")}</h1>

      <div className="rounded-xl border border-border bg-panel p-6">
        <ProgressBar job={current} />
      </div>

      {done && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-green-300">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-lg font-medium">{t("render.success")}</span>
          </div>
          {outputSrc ? (
            <video
              key={outputSrc}
              src={outputSrc}
              controls
              className="mb-4 w-full rounded-lg bg-black"
            />
          ) : (
            <p className="mb-4 text-sm text-zinc-400">Carregando vídeo…</p>
          )}
          <div className="flex flex-wrap gap-3">
            {outputSrc && (
            <a
              href={outputSrc}
              download={`legendado_${current?.filename ?? "video.mp4"}`}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-bg"
            >
              <Download className="h-5 w-5" />
              {t("render.downloadLabeled")}
            </a>
            )}
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-5 py-3 font-semibold text-zinc-100 hover:bg-border/40"
            >
              <Plus className="h-5 w-5" />
              {t("render.newVideo")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          <div className="font-medium">{t("render.errorTitle")}</div>
          <div className="mt-1 text-sm">{current?.message}</div>
          <button
            onClick={() => router.push(`/editor/${jobId}`)}
            className="mt-3 rounded-lg bg-red-500/20 px-4 py-2 text-sm"
          >
            {t("render.tryAgain")}
          </button>
        </div>
      )}

      {!done && !error && (
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("render.backgroundHint")}
        </div>
      )}
    </main>
  );
}
