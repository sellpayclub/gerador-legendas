"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, Film, Trash2, Scissors, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { uploadVideo, deleteJob, type JobState } from "@/lib/api";

const ACCEPTED = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"];

const LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "Detectar automaticamente" },
  { value: "pt", label: "Português" },
  { value: "en", label: "Inglês (English)" },
  { value: "es", label: "Espanhol (Español)" },
  { value: "fr", label: "Francês (Français)" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Alemão (Deutsch)" },
];

type AppMode = "legendas" | "cortes";

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobState[]>([]);
  const [language, setLanguage] = useState("auto");
  const [mode, setMode] = useState<AppMode>("legendas");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const languageRef = useRef("auto");
  const modeRef = useRef<AppMode>("legendas");
  languageRef.current = language;
  modeRef.current = mode;

  const loadJobs = useCallback(async () => {
    try {
      const r = await fetch("/api/jobs");
      const d: { jobs: JobState[] } = await r.json();
      setRecentJobs(d.jobs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const jobRoute = (j: JobState) =>
    j.mode === "cortes" ? `/cortes/${j.id}` : `/editor/${j.id}`;

  const handleDelete = useCallback(
    async (jobId: string) => {
      if (!confirm("Apagar este vídeo e seus arquivos? Esta ação não pode ser desfeita.")) {
        return;
      }
      setDeletingId(jobId);
      try {
        await deleteJob(jobId);
        setRecentJobs((jobs) => jobs.filter((j) => j.id !== jobId));
      } catch {
        await loadJobs();
      } finally {
        setDeletingId(null);
      }
    },
    [loadJobs],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        setError(`Formato não suportado: ${ext}. Use ${ACCEPTED.join(", ")}`);
        return;
      }
      setUploading(true);
      setProgress(0);
      const fakeTimer = setInterval(() => {
        setProgress((p) => (p === null ? 0 : Math.min(95, p + 5)));
      }, 400);
      try {
        const job = await uploadVideo(file, languageRef.current, modeRef.current);
        setProgress(100);
        router.push(modeRef.current === "cortes" ? `/cortes/${job.id}` : `/editor/${job.id}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro no upload");
      } finally {
        clearInterval(fakeTimer);
        setUploading(false);
      }
    },
    [router],
  );

  return (
    <main className="flex flex-col items-center py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Legendas Locais</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Legendas automáticas ou cortes virais de vídeos longos
        </p>
      </div>

      <div className="mb-4 w-full max-w-2xl">
        <label className="mb-1 block text-xs font-medium text-zinc-400">Modo</label>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("legendas")}
            disabled={uploading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
              mode === "legendas"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-panel text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Type className="h-4 w-4" />
            Legendas
          </button>
          <button
            type="button"
            onClick={() => setMode("cortes")}
            disabled={uploading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
              mode === "cortes"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-panel text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Scissors className="h-4 w-4" />
            Cortes
          </button>
        </div>
        <label className="mb-1 block text-xs font-medium text-zinc-400">Idioma do áudio</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={uploading}
          className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent disabled:opacity-50"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        {mode === "cortes" && (
          <p className="mt-2 text-xs text-zinc-500">
            Ideal para vídeos de 10–60 min. A IA encontra trechos de 1–3 min com sacadas e gera MP4s com legenda.
          </p>
        )}
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
        className={`w-full max-w-2xl rounded-2xl border-2 border-dashed p-12 text-center transition ${
          dragging ? "border-accent bg-accent/5" : "border-border bg-panel"
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
              Enviando vídeo... {progress !== null ? `${progress}%` : ""}
            </div>
            {progress !== null && (
              <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <Upload className="h-8 w-8 text-accent" />
            </div>
            <div className="text-lg font-medium">Arraste o vídeo ou clique para escolher</div>
            <div className="text-xs text-zinc-500">
              MP4, MOV, MKV, AVI, WebM — vídeos longos OK no modo Cortes
            </div>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {recentJobs.length > 0 && (
        <div className="mt-12 w-full max-w-2xl">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Trabalhos recentes</h2>
          <ul className="space-y-2">
            {recentJobs.slice(0, 8).map((j) => (
              <li key={j.id}>
                <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 hover:border-accent/50">
                  <button
                    onClick={() => router.push(jobRoute(j))}
                    className="flex flex-1 items-center gap-3 truncate text-left"
                  >
                    {j.mode === "cortes" ? (
                      <Scissors className="h-5 w-5 shrink-0 text-accent" />
                    ) : (
                      <Film className="h-5 w-5 shrink-0 text-accent" />
                    )}
                    <div className="flex-1 truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate text-sm">{j.filename}</span>
                        {j.mode === "cortes" && (
                          <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                            Cortes
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {j.stage} · {Math.round(j.duration / 60)} min
                        {j.clip_count ? ` · ${j.clip_count} cortes` : ""}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(j.id);
                    }}
                    disabled={deletingId === j.id}
                    title="Apagar vídeo"
                    aria-label="Apagar vídeo"
                    className="shrink-0 rounded-md p-2 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  >
                    {deletingId === j.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
