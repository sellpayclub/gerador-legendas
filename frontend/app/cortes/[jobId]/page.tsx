"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronLeft, Loader2, Scissors } from "lucide-react";
import VideoPreview from "@/components/VideoPreview";
import ClipListPanel from "@/components/ClipListPanel";
import ClipBoundsEditor from "@/components/ClipBoundsEditor";
import CortesStepBar, { type CortesStep } from "@/components/CortesStepBar";
import ClipExportPanel from "@/components/ClipExportPanel";
import ClipFormatPicker, {
  CORTES_VERTICAL,
  defaultPositionForAspect,
} from "@/components/ClipFormatPicker";
import StylePicker from "@/components/StylePicker";
import TranscriptEditor from "@/components/TranscriptEditor";
import HighlightPanel from "@/components/HighlightPanel";
import {
  getClipKeywords,
  getClipWords,
  getClips,
  getJob,
  getWords,
  renderSingleClip,
  saveClipKeywords,
  saveClipWords,
  saveClips,
  saveClipsSettings,
  sliceWordsForClip,
  startClipsRender,
  startTranscribe,
  waitForClips,
  type ClipSegment,
  type JobState,
  type StyleConfig,
  type Word,
  type WordsData,
} from "@/lib/api";
import { groupHighlightPhrases } from "@/lib/highlightPhrases";
import { useJobEvents } from "@/lib/useJobEvents";

const DEFAULT_STYLE: StyleConfig = {
  font: "Roboto",
  font_size: 72,
  text_case: "normal",
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
  pause_threshold_s: 0.45,
};

function labelForStage(stage: string): string {
  const map: Record<string, string> = {
    queued: "Na fila",
    extracting_audio: "Extraindo áudio",
    audio_ready: "Áudio pronto",
    transcribing: "Transcrevendo",
    transcribed: "Transcrição pronta",
    generating_ass: "Gerando legendas",
    rendering: "Renderizando cortes",
    done: "Pronto",
    error: "Erro",
  };
  return map[stage] ?? stage;
}

const STEP_HINTS: Record<CortesStep, string> = {
  1: "Marque os cortes desejados. O painel «Ajustar corte» fica fixo abaixo da lista — role só a lista se precisar.",
  2: "Estilo e destaques valem para todos os cortes selecionados; texto e frases de destaque são por corte.",
  3: "Gere um MP4 separado por corte marcado — o vídeo original completo não é exportado.",
};

type Step2Tab = "style" | "highlights" | "text";

export default function CortesPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;

  const [job, setJob] = useState<JobState | null>(null);
  const [wordsData, setWordsData] = useState<WordsData | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [clipList, setClipList] = useState<ClipSegment[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [step, setStep] = useState<CortesStep>(1);
  const [style, setStyle] = useState<StyleConfig>(DEFAULT_STYLE);
  const [wordsPerLine, setWordsPerLine] = useState(4);
  const [aspect, setAspect] = useState<"original" | "vertical">("vertical");
  const [position, setPosition] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [clipWords, setClipWords] = useState<Word[]>([]);
  const [clipKeywords, setClipKeywords] = useState<number[]>([]);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [step2Tab, setStep2Tab] = useState<Step2Tab>("style");
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [renderingAll, setRenderingAll] = useState(false);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [settingsReady, setSettingsReady] = useState(false);

  const videoControlsRef = useRef<{ seek: (t: number) => void; getCurrentTime: () => number } | null>(null);
  const retriedTranscribe = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipWordsCache = useRef<Record<string, Word[]>>({});
  const clipKeywordsCache = useRef<Record<string, number[]>>({});

  const { job: liveJob } = useJobEvents(jobId, true);

  useEffect(() => {
    if (liveJob) setJob(liveJob);
    if (liveJob?.stage === "error") {
      setError(liveJob.message || "Falha ao processar.");
    }
  }, [liveJob]);

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
          if (w.words.length === 0 && !retriedTranscribe.current) {
            retriedTranscribe.current = true;
            await startTranscribe(jobId);
          }
        } else if (j.stage === "error") {
          setError(j.message || "Falha ao processar o vídeo.");
        } else if (j.stage === "audio_ready") {
          try {
            await startTranscribe(jobId);
          } catch {
            /* already running */
          }
        }
        const clipsData = await getClips(jobId).catch(() => null);
        if (!active) return;
        if (clipsData?.style) {
          setStyle({ ...DEFAULT_STYLE, ...clipsData.style });
          if (clipsData.style.pos_x != null || clipsData.style.pos_y != null) {
            setPosition({
              x: clipsData.style.pos_x ?? null,
              y: clipsData.style.pos_y ?? null,
            });
          }
        }
        if (clipsData?.words_per_line) setWordsPerLine(clipsData.words_per_line);
        if (clipsData?.aspect) setAspect(clipsData.aspect);
        if (clipsData?.highlight_enabled != null) setHighlightEnabled(clipsData.highlight_enabled);
        if (clipsData?.clips?.length) {
          setClipList(clipsData.clips);
          setActiveClipId(clipsData.clips[0].id);
        }
        setSettingsReady(true);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (!wordsData && job?.stage !== "error") {
      const id = setInterval(async () => {
        try {
          const j = await getJob(jobId);
          setJob(j);
          if (j.has_words) {
            const w = await getWords(jobId);
            setWordsData(w);
            setWords(w.words);
          }
        } catch {
          /* ignore */
        }
      }, 3000);
      return () => clearInterval(id);
    }
  }, [jobId, wordsData, job?.stage]);

  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(videoControlsRef.current?.getCurrentTime() ?? 0);
    }, 200);
    return () => clearInterval(t);
  }, []);

  const activeClip = useMemo(
    () => clipList.find((c) => c.id === activeClipId) ?? null,
    [clipList, activeClipId],
  );

  const enabledClips = useMemo(
    () => clipList.filter((c) => c.enabled),
    [clipList],
  );

  const loadClipKeywords = useCallback(
    async (clipId: string) => {
      if (clipKeywordsCache.current[clipId]) {
        setClipKeywords(clipKeywordsCache.current[clipId]);
        return;
      }
      try {
        const r = await getClipKeywords(jobId, clipId);
        clipKeywordsCache.current[clipId] = r.indices;
        setClipKeywords(r.indices);
      } catch {
        clipKeywordsCache.current[clipId] = [];
        setClipKeywords([]);
      }
    },
    [jobId],
  );

  const loadClipWords = useCallback(
    async (clip: ClipSegment) => {
      if (clipWordsCache.current[clip.id]) {
        setClipWords(clipWordsCache.current[clip.id]);
        return;
      }
      try {
        const r = await getClipWords(jobId, clip.id);
        clipWordsCache.current[clip.id] = r.words;
        setClipWords(r.words);
      } catch {
        const sliced = sliceWordsForClip(words, clip.start_s, clip.end_s);
        clipWordsCache.current[clip.id] = sliced;
        setClipWords(sliced);
      }
    },
    [jobId, words],
  );

  useEffect(() => {
    if (!activeClip || step < 2) {
      setClipWords([]);
      setClipKeywords([]);
      return;
    }
    const id = activeClip.id;
    setClipWords(clipWordsCache.current[id] ?? []);
    setClipKeywords(clipKeywordsCache.current[id] ?? []);
    void loadClipWords(activeClip);
    void loadClipKeywords(id);
  }, [activeClip?.id, step, loadClipWords, loadClipKeywords]);

  useEffect(() => {
    if (step < 2) return;
    const first = enabledClips[0];
    if (!first) return;
    if (!activeClipId || !enabledClips.some((c) => c.id === activeClipId)) {
      setActiveClipId(first.id);
    }
  }, [step, enabledClips, activeClipId]);

  const previewClip = activeClip ?? enabledClips[0] ?? null;

  const previewWords = useMemo(() => {
    if (step >= 2 && previewClip && clipWords.length) {
      return clipWords.map((w) => ({
        ...w,
        start: w.start + previewClip.start_s,
        end: w.end + previewClip.start_s,
      }));
    }
    return words;
  }, [step, previewClip, clipWords, words]);

  const highlightPhrases = useMemo(() => {
    if (step < 2 || !highlightEnabled || !previewClip) return [];
    const phrases = groupHighlightPhrases(clipWords, clipKeywords);
    return phrases.map((p) => ({
      ...p,
      start: p.start + previewClip.start_s,
      end: p.end + previewClip.start_s,
    }));
  }, [step, highlightEnabled, previewClip, clipWords, clipKeywords]);

  const previewSize = useMemo(() => {
    if (step >= 2 && aspect === "vertical") {
      return { width: CORTES_VERTICAL.width, height: CORTES_VERTICAL.height };
    }
    return {
      width: wordsData?.width ?? 1920,
      height: wordsData?.height ?? 1080,
    };
  }, [step, aspect, wordsData]);

  /** Seek into clip / first highlight so preview shows destaque immediately. */
  useEffect(() => {
    if (step < 2 || !previewClip) return;
    const t = highlightPhrases[0]?.start ?? previewClip.start_s;
    const id = window.setTimeout(() => videoControlsRef.current?.seek(t), 150);
    return () => window.clearTimeout(id);
  }, [step, previewClip?.id, highlightPhrases[0]?.start, previewClip?.start_s]);

  const transcribing = job && !wordsData && job.stage !== "error";
  const stageLabel = labelForStage(job?.stage ?? "");

  const persistClips = useCallback(
    async (next: ClipSegment[]) => {
      setClipList(next);
      try {
        await saveClips(jobId, next);
      } catch {
        /* ignore */
      }
    },
    [jobId],
  );

  const persistSettings = useCallback(
    async (patch: {
      style?: StyleConfig;
      words_per_line?: number;
      aspect?: "original" | "vertical";
      highlight_enabled?: boolean;
    }) => {
      if (!settingsReady) return;
      try {
        const stylePayload = patch.style ?? style;
        await saveClipsSettings(jobId, {
          style: {
            ...stylePayload,
            pos_x: stylePayload.pos_x ?? position.x,
            pos_y: stylePayload.pos_y ?? position.y,
          },
          words_per_line: patch.words_per_line ?? wordsPerLine,
          aspect: patch.aspect ?? aspect,
          highlight_enabled: patch.highlight_enabled ?? highlightEnabled,
        });
      } catch {
        /* ignore */
      }
    },
    [jobId, style, wordsPerLine, aspect, position, highlightEnabled, settingsReady],
  );

  useEffect(() => {
    if (!settingsReady) return;
    const t = setTimeout(() => {
      persistSettings({});
    }, 800);
    return () => clearTimeout(t);
  }, [style, wordsPerLine, aspect, position, highlightEnabled, settingsReady, persistSettings]);

  const handleAspectChange = useCallback(
    (next: "original" | "vertical") => {
      if (next === aspect) return;
      setAspect(next);
      const vw = wordsData?.width ?? 1920;
      const vh = wordsData?.height ?? 1080;
      const pos = defaultPositionForAspect(next, vw, vh, style.margin_v ?? 120);
      setPosition(pos);
      const nextStyle = { ...style, pos_x: pos.x, pos_y: pos.y };
      setStyle(nextStyle);
      persistSettings({ aspect: next, style: nextStyle });
    },
    [aspect, wordsData, style, persistSettings],
  );

  const handleDetect = async () => {
    setDetecting(true);
    setDetectStatus("Detectando cortes com IA...");
    setError(null);
    try {
      const r = await waitForClips(jobId, {
        onProgress: (msg) => setDetectStatus(msg),
      });
      const list = r.clips ?? [];
      setClipList(list);
      clipWordsCache.current = {};
      if (list.length) setActiveClipId(list[0].id);
      if (!list.length) {
        setError("Nenhum corte encontrado — tente de novo ou ajuste manualmente.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao detectar cortes");
    } finally {
      setDetecting(false);
      setDetectStatus(null);
    }
  };

  const handleToggle = (id: string) => {
    persistClips(clipList.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const handleRemove = (id: string) => {
    const next = clipList.filter((c) => c.id !== id);
    delete clipWordsCache.current[id];
    persistClips(next);
    if (activeClipId === id) setActiveClipId(next[0]?.id ?? null);
  };

  const handleReorder = (id: string, direction: "up" | "down") => {
    const idx = clipList.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= clipList.length) return;
    const next = clipList.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    persistClips(next);
  };

  const handleClipChange = (updated: ClipSegment) => {
    const next = clipList.map((c) => (c.id === updated.id ? updated : c));
    delete clipWordsCache.current[updated.id];
    persistClips(next);
  };

  const handlePreview = (clip: ClipSegment) => {
    videoControlsRef.current?.seek(clip.start_s);
  };

  const handleClipWordsChange = (next: Word[]) => {
    if (!activeClipId) return;
    clipWordsCache.current[activeClipId] = next;
    setClipWords(next);
  };

  const handleSaveClipWords = async () => {
    if (!activeClipId) return;
    await saveClipWords(jobId, activeClipId, clipWords);
  };

  const seekClipTime = useCallback(
    (clipRelativeS: number) => {
      const base = previewClip?.start_s ?? 0;
      videoControlsRef.current?.seek(clipRelativeS + base);
    },
    [previewClip?.start_s],
  );

  const handleKeywordsChange = (indices: number[]) => {
    if (!activeClipId) return;
    clipKeywordsCache.current[activeClipId] = indices;
    setClipKeywords(indices);
    saveClipKeywords(jobId, activeClipId, indices).catch(() => {});
    if (highlightEnabled && indices.length > 0 && clipWords.length > 0) {
      const first = groupHighlightPhrases(clipWords, indices)[0];
      if (first) window.setTimeout(() => seekClipTime(first.start), 80);
    }
  };

  const renderBody = () => ({
    aspect,
    preset: null as string | null,
    custom: { ...style, pos_x: position.x, pos_y: position.y },
    words_per_line: wordsPerLine,
    resolution: "1080p" as const,
    highlight_enabled: highlightEnabled,
  });

  const pollClips = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await getClips(jobId);
        setClipList(r.clips ?? []);
        const stillBusy = (r.clips ?? []).some((c) => c.status === "rendering");
        if (!stillBusy) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setRenderingIds(new Set());
          setRenderingAll(false);
        }
      } catch {
        /* ignore */
      }
    }, 2000);
  }, [jobId]);

  const handleRenderOne = async (clipId: string) => {
    if (renderingIds.has(clipId)) return;
    setRenderingIds((prev) => new Set(prev).add(clipId));
    setClipList((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, status: "rendering" as const } : c)),
    );
    setError(null);
    try {
      await renderSingleClip(jobId, clipId, renderBody());
      pollClips();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar corte";
      setError(msg.includes("409") ? "Corte já está gerando — aguarde ou recarregue a página." : msg);
      setClipList((prev) =>
        prev.map((c) =>
          c.id === clipId ? { ...c, status: c.status === "done" ? "done" : "pending" } : c,
        ),
      );
      setRenderingIds((prev) => {
        const n = new Set(prev);
        n.delete(clipId);
        return n;
      });
    }
  };

  const handleRenderAll = async () => {
    const ids = clipList.filter((c) => c.enabled).map((c) => c.id);
    if (!ids.length) {
      setError("Selecione ao menos um corte.");
      return;
    }
    setRenderingAll(true);
    setError(null);
    try {
      await startClipsRender(jobId, { clip_ids: ids, ...renderBody() });
      pollClips();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar exportação");
      setRenderingAll(false);
    }
  };

  const canContinueStep1 = clipList.some((c) => c.enabled);

  const goNext = () => {
    if (step === 1 && !canContinueStep1) {
      setError("Selecione ao menos um corte para continuar.");
      return;
    }
    setError(null);
    if (step === 1) {
      const first = enabledClips[0];
      if (first) setActiveClipId(first.id);
    }
    setStep((s) => Math.min(3, s + 1) as CortesStep);
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1) as CortesStep);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-3 flex shrink-0 items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> Início
        </button>
        <Scissors className="h-4 w-4 text-accent" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{job?.filename}</div>
        {job && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            Cortes · {stageLabel}
          </span>
        )}
      </header>

      <CortesStepBar step={step} onStep={(s) => setStep(s)} />

      <p className="mb-3 shrink-0 text-xs text-zinc-500">{STEP_HINTS[step]}</p>

      {transcribing && (
        <div className="mb-3 flex shrink-0 items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <div>
            <div className="text-sm font-medium text-zinc-100">Transcrevendo vídeo...</div>
            <div className="text-xs text-zinc-500">
              {job?.message || "Aguarde — vídeos longos podem levar alguns minutos."}
            </div>
          </div>
        </div>
      )}

      {detectStatus && (
        <div className="mb-3 flex shrink-0 items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <div className="text-sm text-zinc-300">{detectStatus}</div>
        </div>
      )}

      {error && (
        <div className="mb-3 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden pb-24 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex max-h-[min(48dvh,520px)] min-h-[180px] min-h-0 flex-col overflow-hidden lg:max-h-full lg:min-h-[240px]">
          {step >= 2 && highlightEnabled && (
            <p className="mb-1 shrink-0 text-center text-[10px] text-accent">
              {clipKeywords.length > 0
                ? `Destaques ativos — ${clipKeywords.length} palavra(s) · dê play no trecho`
                : "Destaques ligados — aba Destaques → Detectar com IA"}
            </p>
          )}
          {wordsData && (
            <VideoPreview
              jobId={jobId}
              width={previewSize.width}
              height={previewSize.height}
              words={previewWords}
              style={{ ...style, pos_x: position.x, pos_y: position.y }}
              wordsPerLine={wordsPerLine}
              onPositionChange={(pos) => {
                setPosition(pos);
                setStyle((s) => ({ ...s, pos_x: pos.x, pos_y: pos.y }));
              }}
              position={position}
              registerControls={(c) => (videoControlsRef.current = c)}
              compact
              compactMaxHeight="100%"
              highlightEnabled={step >= 2 && highlightEnabled}
              highlightPhrases={highlightPhrases}
              activeClip={
                previewClip
                  ? { start: previewClip.start_s, end: previewClip.end_s }
                  : null
              }
              videoObjectFit={step >= 2 && aspect === "vertical" ? "cover" : "contain"}
            />
          )}
          {step >= 2 && (
            <p className="mt-1 shrink-0 text-center text-[10px] text-zinc-500">
              Preview em {aspect === "vertical" ? "9:16 vertical" : "formato original"} — arraste a legenda
            </p>
          )}
        </div>

        <aside className="grid h-full min-h-0 max-h-full grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden rounded-xl border border-border bg-panel">
          {step === 1 && (
            <>
              <div className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                <ClipListPanel
                  clips={clipList}
                  activeId={activeClipId}
                  detecting={detecting}
                  onDetect={handleDetect}
                  onSelect={setActiveClipId}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  onPreview={handlePreview}
                  onReorder={handleReorder}
                />
                <p className="border-t border-border/50 px-4 py-2 text-center text-[10px] text-zinc-500">
                  ↓ Role a lista acima · ajuste fica fixo abaixo
                </p>
              </div>
              <ClipBoundsEditor clip={activeClip} onChange={handleClipChange} />
            </>
          )}

          {step !== 1 && (
            <div className="row-span-2 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {(step === 2 || step === 3) && wordsData && (
                <div className="flex flex-col">
                  {step === 2 && (
                    <>
                  <div className="border-b border-border bg-accent/5 px-4 py-2.5 text-xs text-zinc-300">
                    Editando corte{" "}
                    <span className="font-semibold text-accent">
                      {enabledClips.findIndex((c) => c.id === activeClipId) + 1 || 1}
                    </span>{" "}
                    de {enabledClips.length} selecionado(s)
                  </div>

                  {enabledClips.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
                      {enabledClips.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveClipId(c.id)}
                          className={`rounded-md px-2 py-1 text-xs ${
                            c.id === activeClipId
                              ? "bg-accent/10 text-accent"
                              : "bg-border/50 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {c.title.slice(0, 28)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="border-b border-border bg-panel/40">
                    <ClipFormatPicker
                      aspect={aspect}
                      onChange={handleAspectChange}
                      compact
                    />
                  </div>

                  <div className="flex border-b border-border">
                    {(
                      [
                        ["style", "Estilo"],
                        ["highlights", "Destaques"],
                        ["text", "Texto"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setStep2Tab(id)}
                        className={`flex-1 px-2 py-2.5 text-xs font-medium transition ${
                          step2Tab === id
                            ? "border-b-2 border-accent text-accent"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {label}
                        {id === "highlights" && highlightEnabled && (
                          <span className="ml-1 text-[10px] text-accent">●</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {step2Tab === "style" && (
                    <>
                      {highlightEnabled && clipKeywords.length === 0 && (
                        <p className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-200">
                          Para frase grande + blur: aba <strong>Destaques</strong> → ligue o
                          toggle → Detectar com IA
                        </p>
                      )}
                    <StylePicker
                      style={style}
                      onChange={setStyle}
                      wordsPerLine={wordsPerLine}
                      onWordsPerLineChange={setWordsPerLine}
                      videoHeight={previewSize.height}
                      videoWidth={previewSize.width}
                      position={position}
                      onPositionChange={(pos) => {
                        setPosition(pos);
                        setStyle((s) => ({ ...s, pos_x: pos.x, pos_y: pos.y }));
                      }}
                    />
                    </>
                  )}

                  {step2Tab === "highlights" && activeClipId && (
                    <HighlightPanel
                      jobId={jobId}
                      clipId={activeClipId}
                      words={clipWords}
                      highlightEnabled={highlightEnabled}
                      onHighlightEnabledChange={(v) => {
                        setHighlightEnabled(v);
                        persistSettings({ highlight_enabled: v });
                      }}
                      keywords={clipKeywords}
                      onKeywordsChange={handleKeywordsChange}
                      onPreviewAt={seekClipTime}
                    />
                  )}

                  {step2Tab === "text" && (
                    <div className="min-h-[200px]">
                      <TranscriptEditor
                        jobId={jobId}
                        words={clipWords}
                        onChange={handleClipWordsChange}
                        onSave={handleSaveClipWords}
                        onSeek={(t) =>
                          videoControlsRef.current?.seek(
                            activeClip ? t + activeClip.start_s : t,
                          )
                        }
                        currentTime={
                          activeClip ? Math.max(0, currentTime - activeClip.start_s) : currentTime
                        }
                        disableEnrich
                      />
                    </div>
                  )}
                    </>
                  )}

                  {step === 3 && (
                    <>
                      <div className="border-b border-border bg-panel/80 px-4 py-3">
                        <p className="text-xs text-zinc-400">
                          Ajustar legenda antes de exportar?
                        </p>
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="mt-2 text-xs font-medium text-accent hover:underline"
                        >
                          ← Voltar para editar Estilo / Destaques / Texto
                        </button>
                        {highlightEnabled && (
                          <p className="mt-2 text-[10px] text-accent">
                            Destaques dramáticos incluídos no MP4
                          </p>
                        )}
                      </div>
                      <ClipExportPanel
                        jobId={jobId}
                        clips={clipList}
                        aspect={aspect}
                        onRenderOne={handleRenderOne}
                        onRenderAll={handleRenderAll}
                        renderingAll={renderingAll}
                        renderingIds={renderingIds}
                        onEditFormat={() => {
                          setStep(2);
                          setStep2Tab("style");
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="hidden shrink-0 border-t border-border bg-panel p-3 lg:block">
            <p className="mb-2 text-center text-[10px] text-zinc-500">
              Etapa {step} de 3 — use o botão amarelo abaixo da tela
            </p>
          </div>
        </aside>
      </div>

      {/* Barra fixa — SEMPRE visível em qualquer tela */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-accent/40 bg-[#121214]/98 px-3 py-3 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md sm:px-5">
        <div className="mx-auto flex max-w-[1920px] items-center gap-3">
          <div className="hidden min-w-0 flex-1 text-xs text-zinc-400 sm:block">
            <span className="font-medium text-zinc-200">Etapa {step}/3</span>
            {" · "}
            {step === 1 && `${clipList.filter((c) => c.enabled).length} corte(s) selecionado(s)`}
            {step === 2 && "Estilo + destaques + texto dos cortes selecionados"}
            {step === 3 && "Gere e baixe os MP4s"}
          </div>
          <div className="flex w-full flex-1 gap-2 sm:w-auto sm:flex-none">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center justify-center gap-1 rounded-lg border border-border px-4 py-3 text-sm text-zinc-300 hover:bg-border/40"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Voltar</span>
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={transcribing || (step === 1 && !canContinueStep1)}
                className="flex min-w-[200px] flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-bg shadow-lg shadow-accent/20 disabled:opacity-50 sm:flex-none"
              >
                {step === 1 ? "Continuar para legendas" : "Continuar para exportar"}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="flex flex-1 items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-zinc-200 hover:bg-border/40 sm:flex-none"
              >
                Novo vídeo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
