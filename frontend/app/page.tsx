"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, Film, Trash2, Scissors, Type, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadVideo, deleteJob, getHealth, type JobState } from "@/lib/api";
import Field from "@/components/ui/Field";
import IconButton from "@/components/ui/IconButton";
import { inputClass } from "@/components/ui/inputClass";

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
  const [needsConfig, setNeedsConfig] = useState(false);
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

  useEffect(() => {
    getHealth()
      .then((h) => setNeedsConfig(!h.openai_configured))
      .catch(() => setNeedsConfig(false));
  }, []);

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
    <main className="flex flex-col items-center py-10 sm:py-14">
      <div className="mb-6 flex w-full max-w-2xl items-start justify-between gap-4">
        <div className="flex-1" />
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100"
        >
          <Settings className="h-4 w-4" />
          Configurações
        </Link>
      </div>

      {needsConfig && (
        <Link
          href="/configuracoes"
          className="mb-6 w-full max-w-2xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 transition hover:border-amber-400/60"
        >
          Configure sua chave OpenAI para começar a transcrever e detectar cortes →
        </Link>
      )}

      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Legendas Locais</h1>
        <p className="mt-2 text-sm text-muted">
          Legendas automáticas ou cortes virais de vídeos longos
        </p>
      </div>

      <div className="mb-6 w-full max-w-2xl space-y-4">
        <Field label="Modo">
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
                  Legendas
                </div>
                <p className="mt-0.5 text-xs text-muted">Transcrever, estilizar e exportar com legenda</p>
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
                  Cortes
                </div>
                <p className="mt-0.5 text-xs text-muted">IA encontra trechos virais e exporta MP4s</p>
              </div>
            </button>
          </div>
        </Field>

        <Field
          label="Idioma do áudio"
          hint={mode === "cortes" ? "Ideal para vídeos de 10–60 min no modo Cortes." : undefined}
        >
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={uploading}
            className={inputClass}
          >
            {LANGUAGES.map((l) => (
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
          dragging
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
              Enviando vídeo... {progress !== null ? `${progress}%` : ""}
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
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/25">
              <Upload className="h-8 w-8 text-accent" />
            </div>
            <div className="text-lg font-medium text-zinc-100">Arraste o vídeo ou clique para escolher</div>
            <div className="text-sm text-muted">
              MP4, MOV, MKV, AVI, WebM — vídeos longos OK no modo Cortes
            </div>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 w-full max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {recentJobs.length > 0 && (
        <div className="mt-12 w-full max-w-2xl">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Trabalhos recentes</h2>
          <ul className="space-y-2">
            {recentJobs.slice(0, 8).map((j) => (
              <li key={j.id}>
                <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2.5 hover:border-accent/40 sm:gap-3 sm:px-4 sm:py-3">
                  <button
                    type="button"
                    onClick={() => router.push(jobRoute(j))}
                    className="flex min-h-[44px] flex-1 items-center gap-3 truncate text-left"
                  >
                    {j.mode === "cortes" ? (
                      <Scissors className="h-5 w-5 shrink-0 text-accent" />
                    ) : (
                      <Film className="h-5 w-5 shrink-0 text-accent" />
                    )}
                    <div className="flex-1 truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate text-sm font-medium text-zinc-100">{j.filename}</span>
                        {j.mode === "cortes" && (
                          <span className="shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
                            Cortes
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {j.stage} · {Math.round(j.duration / 60)} min
                        {j.clip_count ? ` · ${j.clip_count} cortes` : ""}
                      </div>
                    </div>
                  </button>
                  <IconButton
                    variant="danger"
                    onClick={() => handleDelete(j.id)}
                    disabled={deletingId === j.id}
                    title="Apagar vídeo"
                    aria-label="Apagar vídeo"
                  >
                    {deletingId === j.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Trash2 className="h-5 w-5" />
                    )}
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
