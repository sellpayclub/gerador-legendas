"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, LayoutTemplate, Loader2, Sparkles, Type, ScrollText, Wand2 } from "lucide-react";
import VideoPreview from "@/components/VideoPreview";
import StylePicker from "@/components/StylePicker";
import TranscriptEditor from "@/components/TranscriptEditor";
import TemplatePanel from "@/components/TemplatePanel";
import TemplatePreview from "@/components/TemplatePreview";
import {
  getJob,
  getWords,
  listTemplates,
  saveWords,
  startRender,
  startTranscribe,
  type JobState,
  type ResolutionInfo,
  type StyleConfig,
  type TemplateInfo,
  type Word,
  type WordsData,
} from "@/lib/api";
import { useJobEvents } from "@/lib/useJobEvents";

const DEFAULT_STYLE: StyleConfig = {
  font: "Montserrat",
  font_size: 72,
  primary_color: "#FACC15",
  secondary_color: "#FFFFFF",
  outline_color: "#000000",
  outline_width: 8,
  shadow: 0,
  bold: true,
  italic: false,
  animation: "pop",
  pop_scale: 115,
  pop_duration_ms: 120,
  box: false,
  box_color: "#000000",
  box_opacity: 0.5,
  pos_x: null,
  pos_y: null,
  margin_v: 120,
  letter_spacing: 2,
  word_spacing: 4,
};

type Tab = "style" | "transcript" | "template";

export default function EditorPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;

  const [job, setJob] = useState<JobState | null>(null);
  const [wordsData, setWordsData] = useState<WordsData | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [style, setStyle] = useState<StyleConfig>(DEFAULT_STYLE);
  const [wordsPerLine, setWordsPerLine] = useState(3);
  const [position, setPosition] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [tab, setTab] = useState<Tab>("style");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Template / composition state
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [resolutions, setResolutions] = useState<ResolutionInfo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"480p" | "720p" | "1080p">("1080p");
  const [overlayAsset, setOverlayAsset] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<number[]>([]);
  const [rendering, setRendering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const videoControlsRef = useRef<{ seek: (t: number) => void; getCurrentTime: () => number } | null>(null);
  const retriedTranscribe = useRef(false);

  // Load template list once.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await listTemplates();
        if (!active) return;
        setTemplates(r.templates ?? []);
        setResolutions(r.resolutions ?? []);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  // Initial fetch + decide whether to start transcribing
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const j = await getJob(jobId);
        if (!active) return;
        setJob(j);
        if (j.has_words) {
          const w = await getWords(jobId);
          if (!active) return;
          setWordsData(w);
          setWords(w.words);
          // Bug fix: older runs saved empty words — re-transcribe once
          if (w.words.length === 0 && !retriedTranscribe.current) {
            retriedTranscribe.current = true;
            await startTranscribe(jobId);
          }
        } else if (j.stage === "error") {
          setError(j.message || "Falha ao processar o vídeo.");
        } else if (j.stage === "audio_ready") {
          // Backend auto-transcribes new uploads; this is a fallback for jobs
          // that already have audio but no transcription (e.g. after restart).
          try {
            await startTranscribe(jobId);
          } catch {
            /* already running */
          }
        }
      } catch (e: any) {
        setError(e.message ?? "erro");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  // Live SSE updates
  const { job: liveJob } = useJobEvents(jobId, true);
  useEffect(() => {
    if (liveJob) setJob(liveJob);
    if (liveJob?.stage === "error") {
      setError(liveJob.message || "Falha ao processar o vídeo.");
    }
  }, [liveJob]);

  // Fallback polling: if SSE drops/misses the completion event, keep asking the
  // backend until the transcription exists so the UI never gets stuck loading.
  useEffect(() => {
    if (wordsData) return;
    if (job?.stage === "error") return;
    const id = setInterval(async () => {
      try {
        const j = await getJob(jobId);
        setJob(j);
        if (j.stage === "error") {
          setError(j.message || "Falha ao processar o vídeo.");
          return;
        }
        if (j.has_words) {
          const w = await getWords(jobId);
          setWordsData(w);
          setWords(w.words);
        }
      } catch {
        /* ignore transient errors, keep polling */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [jobId, wordsData, job?.stage]);

  // When transcription completes, fetch words
  useEffect(() => {
    if (liveJob?.has_words) {
      getWords(jobId).then((w) => {
        setWordsData(w);
        setWords(w.words);
      }).catch(() => {});
    }
    if (liveJob?.stage === "rendering" || liveJob?.stage === "generating_ass") {
      setRendering(true);
      // Only follow a render that was started in THIS editing session, so
      // returning to a finished job lets the user keep editing instead of
      // being bounced to the render screen.
      router.push(`/render/${jobId}`);
    }
  }, [liveJob?.stage, liveJob?.has_words, jobId, words.length, router]);

  // Poll currentTime of video for transcript highlight
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(videoControlsRef.current?.getCurrentTime() ?? 0);
    }, 200);
    return () => clearInterval(t);
  }, []);

  const handleSaveWords = async () => {
    await saveWords(jobId, words);
  };

  const handleRender = async () => {
    if (!wordsData) return;
    if (selectedTemplate) {
      const tpl = templates.find(t => t.id === selectedTemplate);
      if (tpl?.needs_overlay && !overlayAsset) {
        alert("Este template exige uma mídia (imagem/vídeo). Envie uma na aba Template.");
        setRendering(false);
        return;
      }
    }
    setRendering(true);
    await startRender(jobId, {
      preset: null,
      custom: style,
      words_per_line: wordsPerLine,
      pos_x: position.x,
      pos_y: position.y,
      template: selectedTemplate,
      resolution,
      keywords: selectedTemplate ? keywords : null,
      overlay_asset: selectedTemplate ? overlayAsset : null,
    });
    router.push(`/render/${jobId}`);
  };

  const stageLabel = useMemo(() => labelForStage(job?.stage ?? ""), [job?.stage]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        {error}
      </div>
    );
  }

  const transcribing = job?.stage === "transcribing" || job?.stage === "extracting_audio";
  // Overlay só enquanto transcreve ou aguarda palavras (não trava se job já tem words no servidor).
  const notReady =
    transcribing ||
    (words.length === 0 && job && !job.has_words && job.stage !== "error");
  const transcribePct = Math.round((job?.progress ?? 0) * 100);

  return (
    <main className="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="truncate text-sm text-zinc-400">
          {job?.filename} · {Math.round((job?.duration ?? 0) / 60)} min
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-row gap-3 overflow-hidden">
        {/* Esquerda: vídeo/template sempre visível */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-panel/30 p-3">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
            {job && selectedTemplate && templates.find(t => t.id === selectedTemplate) ? (
              <TemplatePreview
                jobId={jobId}
                template={templates.find(t => t.id === selectedTemplate)!}
                overlayAsset={overlayAsset}
                words={words}
                style={style}
                wordsPerLine={wordsPerLine}
                currentTime={currentTime}
                registerControls={(c) => (videoControlsRef.current = c)}
              />
            ) : job && (
              <VideoPreview
                jobId={jobId}
                width={job.width}
                height={job.height}
                words={words}
                style={style}
                wordsPerLine={wordsPerLine}
                onPositionChange={setPosition}
                position={position}
                isPlaceholder={words.length === 0}
                compact
                registerControls={(c) => (videoControlsRef.current = c)}
              />
            )}
          </div>
          <div className="flex w-full max-w-md shrink-0 items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2 text-sm">
            <div className={`h-2 w-2 shrink-0 rounded-full ${transcribing ? "animate-pulse bg-accent" : job?.stage === "done" ? "bg-green-500" : "bg-zinc-500"}`} />
            <span className="truncate text-zinc-300">{stageLabel}</span>
            {transcribing && job?.progress !== undefined && (
              <span className="shrink-0 text-zinc-500">{Math.round((job.progress ?? 0) * 100)}%</span>
            )}
          </div>
        </div>

        {/* Direita: ajustes com scroll próprio */}
        <div className="flex min-h-0 w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-panel sm:w-[380px] xl:w-[440px]">
          <div className="flex shrink-0 border-b border-border">
            <TabButton active={tab === "template"} onClick={() => setTab("template")} icon={<LayoutTemplate className="h-4 w-4" />} label="Template" />
            <TabButton active={tab === "style"} onClick={() => setTab("style")} icon={<Type className="h-4 w-4" />} label="Estilo" />
            <TabButton active={tab === "transcript"} onClick={() => setTab("transcript")} icon={<ScrollText className="h-4 w-4" />} label="Transcrição" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "template" ? (
              <TemplatePanel
                jobId={jobId}
                templates={templates}
                resolutions={resolutions}
                selectedTemplate={selectedTemplate}
                onTemplateChange={setSelectedTemplate}
                resolution={resolution}
                onResolutionChange={setResolution}
                overlayAsset={overlayAsset}
                onOverlayAssetChange={setOverlayAsset}
                keywords={keywords}
                onKeywordsChange={setKeywords}
                words={words}
              />
            ) : tab === "style" ? (
              <div className="p-4">
                <StylePicker
                  style={style}
                  onChange={setStyle}
                  wordsPerLine={wordsPerLine}
                  onWordsPerLineChange={setWordsPerLine}
                  videoHeight={job?.height ?? 1920}
                  videoWidth={job?.width ?? 1080}
                  position={position}
                  onPositionChange={setPosition}
                />
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col lg:min-h-0 lg:h-full">
                {transcribing ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Transcrevendo... aguarde para editar.
                  </div>
                ) : words.length > 0 ? (
                  <TranscriptEditor
                    words={words}
                    onChange={setWords}
                    onSave={handleSaveWords}
                    onSeek={(t) => videoControlsRef.current?.seek(t)}
                    currentTime={currentTime}
                  />
                ) : (
                  <div className="p-4 text-sm text-zinc-500">Sem transcrição ainda.</div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border p-3">
            <button
              onClick={handleRender}
              disabled={!wordsData || rendering}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-semibold text-bg disabled:opacity-40"
            >
              {rendering ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
              {rendering ? "Renderizando..." : "Renderizar vídeo"}
            </button>
            {!wordsData && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                Aguarde a transcrição terminar para habilitar o render.
              </p>
            )}
          </div>
        </div>
      </div>

      {notReady && (
        <TranscribingOverlay stage={stageLabel} pct={transcribePct} active={transcribing} />
      )}
    </main>
  );
}

function TranscribingOverlay({ stage, pct, active }: { stage: string; pct: number; active: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-bg/80 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 px-6 text-center">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
          <div className="absolute inset-0 rounded-full border-4 border-border" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-accent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-7 w-7 animate-pulse text-accent" />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-lg font-semibold text-zinc-100">Preparando suas legendas</p>
          <p className="text-sm text-zinc-400">{stage || "Aguarde..."}</p>
        </div>

        {active && (
          <div className="w-full space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.max(6, pct)}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">{pct}%</p>
          </div>
        )}

        <p className="text-xs text-zinc-500">
          A edição é liberada assim que a transcrição terminar.
        </p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium ${
        active ? "border-b-2 border-accent text-accent" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function labelForStage(stage: string): string {
  switch (stage) {
    case "queued": return "Na fila";
    case "extracting_audio": return "Extraindo áudio...";
    case "audio_ready": return "Áudio pronto";
    case "transcribing": return "Transcrevendo com Whisper...";
    case "transcribed": return "Transcrição concluída";
    case "generating_ass": return "Gerando legendas ASS";
    case "rendering": return "Renderizando vídeo (FFmpeg)";
    case "done": return "Vídeo pronto!";
    case "error": return "Erro";
    default: return stage;
  }
}
