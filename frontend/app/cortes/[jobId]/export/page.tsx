"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, CheckCircle2, Plus } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import {
  clipOutputUrl,
  getClips,
  getJob,
  type ClipSegment,
  type JobState,
} from "@/lib/api";
import { useJobEvents } from "@/lib/useJobEvents";

export default function CortesExportPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;

  const [initial, setInitial] = useState<JobState | null>(null);
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const { job } = useJobEvents(jobId, true);

  useEffect(() => {
    getJob(jobId).then(setInitial).catch(() => {});
    getClips(jobId)
      .then((r) => setClips(r.clips ?? []))
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    if (job?.stage === "done") {
      getClips(jobId)
        .then((r) => setClips(r.clips ?? []))
        .catch(() => {});
    }
  }, [job?.stage, jobId]);

  const current = job ?? initial;
  const done = current?.stage === "done";
  const error = current?.stage === "error";
  const rendering = !done && !error && (current?.stage === "rendering" || current?.stage === "generating_ass");

  const readyClips = clips.filter((c) => c.status === "done");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
      <button
        onClick={() => router.push(`/cortes/${jobId}`)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar aos cortes
      </button>

      <h1 className="text-2xl font-bold">Exportando cortes</h1>

      <div className="rounded-xl border border-border bg-panel p-6">
        <ProgressBar job={current} />
      </div>

      {done && readyClips.length > 0 && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6">
          <div className="mb-4 flex items-center gap-2 text-green-300">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-lg font-medium">
              {readyClips.length} corte(s) prontos!
            </span>
          </div>
          <ul className="space-y-4">
            {readyClips.map((clip) => (
              <li
                key={clip.id}
                className="rounded-lg border border-border/50 bg-bg/50 p-4"
              >
                <div className="mb-2 font-medium text-zinc-100">{clip.title}</div>
                <video
                  src={clipOutputUrl(jobId, clip.id)}
                  controls
                  className="mb-3 w-full rounded-lg bg-black"
                />
                <a
                  href={clipOutputUrl(jobId, clip.id)}
                  download={`corte_${clip.title.replace(/[^\w\s-]/g, "").slice(0, 40)}.mp4`}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg"
                >
                  <Download className="h-4 w-4" />
                  Baixar MP4
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-5 py-3 font-semibold text-zinc-100 hover:bg-border/40"
          >
            <Plus className="h-5 w-5" />
            Novo vídeo
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          <div className="font-medium">Erro ao exportar:</div>
          <div className="mt-1 text-sm">{current?.message}</div>
          <button
            onClick={() => router.push(`/cortes/${jobId}`)}
            className="mt-3 rounded-lg bg-red-500/20 px-4 py-2 text-sm"
          >
            Voltar e tentar de novo
          </button>
        </div>
      )}

      {rendering && (
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Gerando cortes com legenda — não feche esta página.
        </div>
      )}
      </div>
    </div>
  );
}
