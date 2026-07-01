"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, CheckCircle2, Plus } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import { getJob, outputUrl, type JobState } from "@/lib/api";
import { useJobEvents } from "@/lib/useJobEvents";

export default function RenderPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;

  const [initial, setInitial] = useState<JobState | null>(null);
  const { job } = useJobEvents(jobId, true);

  useEffect(() => {
    getJob(jobId).then(setInitial).catch(() => {});
  }, [jobId]);

  const current = job ?? initial;
  const done = current?.stage === "done";
  const error = current?.stage === "error";

  return (
    <main className="mx-auto max-w-3xl space-y-6 py-8">
      <button
        onClick={() => router.push(`/editor/${jobId}`)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao editor
      </button>

      <h1 className="text-2xl font-bold">Renderizando seu vídeo</h1>

      <div className="rounded-xl border border-border bg-panel p-6">
        <ProgressBar job={current} />
      </div>

      {done && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-green-300">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-lg font-medium">Vídeo legendado pronto!</span>
          </div>
          <video
            src={outputUrl(jobId)}
            controls
            className="mb-4 w-full rounded-lg bg-black"
          />
          <div className="flex flex-wrap gap-3">
            <a
              href={outputUrl(jobId)}
              download={`legendado_${current?.filename ?? "video.mp4"}`}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-bg"
            >
              <Download className="h-5 w-5" />
              Baixar MP4 legendado
            </a>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-5 py-3 font-semibold text-zinc-100 hover:bg-border/40"
            >
              <Plus className="h-5 w-5" />
              Novo vídeo
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          <div className="font-medium">Erro ao renderizar:</div>
          <div className="mt-1 text-sm">{current?.message}</div>
          <button
            onClick={() => router.push(`/editor/${jobId}`)}
            className="mt-3 rounded-lg bg-red-500/20 px-4 py-2 text-sm"
          >
            Voltar e tentar de novo
          </button>
        </div>
      )}

      {!done && !error && (
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Não feche esta página — o render continua em segundo plano no backend.
        </div>
      )}
    </main>
  );
}
