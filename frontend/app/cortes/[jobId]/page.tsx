"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronLeft, Copy, Loader2, Scissors } from "lucide-react";
import VideoPreview from "@/components/VideoPreview";
import ClipListPanel from "@/components/ClipListPanel";
import ClipDetectOverlay from "@/components/ClipDetectOverlay";
import ClipBoundsEditor from "@/components/ClipBoundsEditor";
import CortesStepBar, { type CortesStep } from "@/components/CortesStepBar";
import ClipExportPanel from "@/components/ClipExportPanel";
import ClipFormatPicker, {
  backendToFormat,
  formatToBackend,
  isComposeFormat,
  needsOverlay,
  templateForFormat,
} from "@/components/ClipFormatPicker";
import ClipComposePanel from "@/components/ClipComposePanel";
import TemplatePreview from "@/components/TemplatePreview";
import StylePicker from "@/components/StylePicker";
import TranscriptEditor from "@/components/TranscriptEditor";
import HighlightPanel from "@/components/HighlightPanel";
import TabBar from "@/components/ui/TabBar";
import Section from "@/components/ui/Section";
import {
  getClipKeywords,
  getClipWords,
  getClips,
  getJob,
  getWords,
  listTemplates,
  pollForClips,
  renderSingleClip,
  saveClipKeywords,
  saveClipWords,
  saveClips,
  saveClipsSettings,
  syncClipsEditing,
  startClipsRender,
  startTranscribe,
  waitForClips,
  type ClipSegment,
  type ComposeSettings,
  type ExportFormatId,
  type JobState,
  type StyleConfig,
  type TemplateInfo,
  type Word,
  type WordsData,
} from "@/lib/api";
import { groupHighlightPhrases } from "@/lib/highlightPhrases";
import { useJobEvents } from "@/lib/useJobEvents";
import { DEFAULT_COMPOSE } from "@/lib/composeDefaults";
import {
  applyFormatSnapshot,
  composeToSettingsPatch,
  defaultSnapshotForFormat,
  parseFormatPresets,
  snapshotFromState,
  type CortesFormatPresets,
} from "@/lib/cortesFormatCache";
import {
  clipWordsToSourceWords,
  exportTimeToSourceTime,
  getActivePlaybackSegment,
  getClipExportDuration,
  getClipPlaybackPlan,
  getClipPreviewStart,
  mergeWordsForClip,
  sourceTimeToExportTime,
} from "@/lib/clipPlayback";

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

const DEFAULT_COMPOSE_LOCAL: ComposeSettings = { ...DEFAULT_COMPOSE };

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
  1: "Marque os cortes desejados. Toque em «Ajustar corte» no rodapé da lista se quiser editar início/fim.",
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
  const [exportFormat, setExportFormat] = useState<ExportFormatId>("reels_full");
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [compose, setCompose] = useState<ComposeSettings>(DEFAULT_COMPOSE_LOCAL);
  const [videoPos, setVideoPos] = useState({ x: 0.5, y: 0.5 });
  const [position, setPosition] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [clipWords, setClipWords] = useState<Word[]>([]);
  const [clipKeywords, setClipKeywords] = useState<number[]>([]);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [step2Tab, setStep2Tab] = useState<Step2Tab>("style");
  const [syncingEdits, setSyncingEdits] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectPhase, setDetectPhase] = useState<"working" | "success">("working");
  const [detectClipCount, setDetectClipCount] = useState(0);
  const [renderingAll, setRenderingAll] = useState(false);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [settingsReady, setSettingsReady] = useState(false);

  const videoControlsRef = useRef<{ seek: (t: number) => void; getCurrentTime: () => number } | null>(null);
  const retriedTranscribe = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipWordsCache = useRef<Record<string, Word[]>>({});
  const clipKeywordsCache = useRef<Record<string, number[]>>({});
  const formatCacheRef = useRef<CortesFormatPresets>({});
  const resumeDetectRef = useRef(false);

  const { job: liveJob } = useJobEvents(jobId, true);

  useEffect(() => {
    if (liveJob) setJob(liveJob);
    if (liveJob?.stage === "error") {
      setError(liveJob.message || "Falha ao processar.");
    }
  }, [liveJob]);

  useEffect(() => {
    listTemplates().then((r) => setTemplates(r.templates ?? [])).catch(() => {});
  }, []);

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
        const loadedStyle = { ...DEFAULT_STYLE, ...(clipsData?.style ?? {}) };
        const loadedPosition =
          clipsData?.style?.pos_x != null || clipsData?.style?.pos_y != null
            ? { x: clipsData!.style!.pos_x ?? null, y: clipsData!.style!.pos_y ?? null }
            : { x: null as number | null, y: null as number | null };
        const loadedCompose: ComposeSettings = {
          ...DEFAULT_COMPOSE_LOCAL,
          overlay_asset: clipsData?.overlay_asset ?? null,
          profile_asset: clipsData?.profile_asset ?? null,
          instagram_username: clipsData?.instagram_username ?? "",
          logo_asset: clipsData?.logo_asset ?? null,
          logo_x: clipsData?.logo_x ?? DEFAULT_COMPOSE_LOCAL.logo_x,
          logo_y: clipsData?.logo_y ?? DEFAULT_COMPOSE_LOCAL.logo_y,
          logo_scale: clipsData?.logo_scale ?? DEFAULT_COMPOSE_LOCAL.logo_scale,
          progress_enabled: clipsData?.progress_enabled ?? false,
          progress_color: clipsData?.progress_color ?? DEFAULT_COMPOSE_LOCAL.progress_color,
          progress_height_pct: clipsData?.progress_height_pct ?? DEFAULT_COMPOSE_LOCAL.progress_height_pct,
          headline_style: clipsData?.headline_style ?? "bold_red",
          headline_bg: clipsData?.headline_bg ?? DEFAULT_COMPOSE_LOCAL.headline_bg,
          headline_color: clipsData?.headline_color ?? DEFAULT_COMPOSE_LOCAL.headline_color,
          headline_font_size: clipsData?.headline_font_size ?? DEFAULT_COMPOSE_LOCAL.headline_font_size,
          headline_align: (clipsData?.headline_align as ComposeSettings["headline_align"]) ?? DEFAULT_COMPOSE_LOCAL.headline_align,
          headline_max_width_pct: clipsData?.headline_max_width_pct ?? DEFAULT_COMPOSE_LOCAL.headline_max_width_pct,
          overlay_pos_x: clipsData?.overlay_pos_x ?? DEFAULT_COMPOSE_LOCAL.overlay_pos_x,
          overlay_pos_y: clipsData?.overlay_pos_y ?? DEFAULT_COMPOSE_LOCAL.overlay_pos_y,
          video_pos_x: clipsData?.video_pos_x ?? DEFAULT_COMPOSE_LOCAL.video_pos_x,
          video_pos_y: clipsData?.video_pos_y ?? DEFAULT_COMPOSE_LOCAL.video_pos_y,
          ig_bg_color: clipsData?.ig_bg_color ?? DEFAULT_COMPOSE_LOCAL.ig_bg_color,
          ig_text_color: clipsData?.ig_text_color ?? DEFAULT_COMPOSE_LOCAL.ig_text_color,
          ig_avatar_size: clipsData?.ig_avatar_size ?? DEFAULT_COMPOSE_LOCAL.ig_avatar_size,
          ig_username_size: clipsData?.ig_username_size ?? DEFAULT_COMPOSE_LOCAL.ig_username_size,
          ig_caption_size: clipsData?.ig_caption_size ?? DEFAULT_COMPOSE_LOCAL.ig_caption_size,
        };
        const loadedVideoPos = {
          x: clipsData?.video_pos_x ?? 0.5,
          y: clipsData?.video_pos_y ?? 0.5,
        };
        const initialFormat = backendToFormat(clipsData?.aspect, clipsData?.template);

        setStyle(loadedStyle);
        if (loadedPosition.x != null || loadedPosition.y != null) setPosition(loadedPosition);
        if (clipsData?.words_per_line) setWordsPerLine(clipsData.words_per_line);
        if (clipsData?.aspect) setAspect(clipsData.aspect);
        setExportFormat(initialFormat);
        setCompose(loadedCompose);
        setVideoPos(loadedVideoPos);
        if (clipsData?.highlight_enabled != null) setHighlightEnabled(clipsData.highlight_enabled);
        if (clipsData?.clips?.length) {
          setClipList(clipsData.clips);
          setActiveClipId(clipsData.clips[0].id);
        }
        if (clipsData?.detect_error) {
          setError(clipsData.detect_error);
        }
        if (clipsData?.detecting) {
          resumeDetectRef.current = true;
        }

        formatCacheRef.current = parseFormatPresets(clipsData?.format_presets);
        formatCacheRef.current[initialFormat] = snapshotFromState(
          loadedPosition,
          loadedStyle,
          loadedCompose,
          loadedVideoPos,
        );
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
        const sliced = mergeWordsForClip(words, clip);
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
      return clipWordsToSourceWords(previewClip, clipWords);
    }
    return words;
  }, [step, previewClip, clipWords, words]);

  const highlightPhrases = useMemo(() => {
    if (step < 2 || !highlightEnabled || !previewClip) return [];
    const phrases = groupHighlightPhrases(clipWords, clipKeywords);
    return phrases.map((p) => ({
      ...p,
      start: exportTimeToSourceTime(previewClip, p.start),
      end: exportTimeToSourceTime(previewClip, p.end),
    }));
  }, [step, highlightEnabled, previewClip, clipWords, clipKeywords]);

  const previewActiveSegment = useMemo(() => {
    if (!previewClip) return null;
    return getActivePlaybackSegment(previewClip, currentTime);
  }, [previewClip, currentTime]);

  const activeTemplate = useMemo(() => {
    const tid = templateForFormat(exportFormat);
    if (!tid) return null;
    return templates.find((t) => t.id === tid) ?? null;
  }, [exportFormat, templates]);

  const previewSize = useMemo(() => {
    if (step >= 2 && activeTemplate) {
      return { width: activeTemplate.width, height: activeTemplate.height };
    }
    if (step >= 2 && exportFormat === "reels_full") {
      return { width: 1080, height: 1920 };
    }
    return {
      width: wordsData?.width ?? 1920,
      height: wordsData?.height ?? 1080,
    };
  }, [step, exportFormat, activeTemplate, wordsData]);

  const previewCompose = useMemo(() => ({
    ...compose,
    headline_text: previewClip?.headline ?? compose.headline_text,
    instagram_caption: previewClip?.caption ?? compose.instagram_caption,
    overlay_asset: previewClip?.overlay_asset ?? compose.overlay_asset ?? null,
  }), [compose, previewClip?.headline, previewClip?.caption, previewClip?.overlay_asset]);

  /** Seek into clip / first highlight so preview shows destaque immediately. */
  useEffect(() => {
    if (step < 2 || !previewClip) return;
    const t = highlightPhrases[0]?.start ?? getClipPreviewStart(previewClip);
    const id = window.setTimeout(() => videoControlsRef.current?.seek(t), 150);
    return () => window.clearTimeout(id);
  }, [step, previewClip?.id, highlightPhrases[0]?.start, previewClip]);

  /** Cold open: jump from hook segment to body when hook ends during playback. */
  useEffect(() => {
    if (!previewClip || previewClip.edit_mode !== "hook_then_body") return;
    const plan = getClipPlaybackPlan(previewClip);
    if (plan.length < 2) return;
    const hook = plan[0];
    const body = plan[1];
    if (currentTime >= hook.end_s - 0.15 && currentTime < body.start_s) {
      videoControlsRef.current?.seek(body.start_s);
    }
  }, [previewClip, currentTime]);

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
    async (patch: Partial<{
      style: StyleConfig;
      words_per_line: number;
      aspect: "original" | "vertical";
      template: string | null;
      highlight_enabled: boolean;
      format_presets: CortesFormatPresets;
    }> & Partial<ComposeSettings>) => {
      if (!settingsReady) return;
      try {
        const stylePayload = patch.style ?? style;
        const fmt = exportFormat;
        const { aspect: fmtAspect, template: fmtTemplate } = formatToBackend(fmt);
        const composePayload = { ...compose, ...patch };
        await saveClipsSettings(jobId, {
          style: {
            ...stylePayload,
            pos_x: stylePayload.pos_x ?? position.x,
            pos_y: stylePayload.pos_y ?? position.y,
          },
          words_per_line: patch.words_per_line ?? wordsPerLine,
          aspect: patch.aspect ?? fmtAspect,
          template: patch.template !== undefined ? patch.template : fmtTemplate,
          highlight_enabled: patch.highlight_enabled ?? highlightEnabled,
          overlay_asset: composePayload.overlay_asset,
          profile_asset: composePayload.profile_asset,
          instagram_username: composePayload.instagram_username,
          logo_asset: composePayload.logo_asset,
          logo_x: composePayload.logo_x,
          logo_y: composePayload.logo_y,
          logo_scale: composePayload.logo_scale,
          progress_enabled: composePayload.progress_enabled,
          progress_color: composePayload.progress_color,
          progress_height_pct: composePayload.progress_height_pct,
          headline_style: composePayload.headline_style,
          headline_bg: composePayload.headline_bg,
          headline_color: composePayload.headline_color,
          headline_font_size: composePayload.headline_font_size,
          headline_align: composePayload.headline_align,
          headline_max_width_pct: composePayload.headline_max_width_pct,
          overlay_pos_x: composePayload.overlay_pos_x,
          overlay_pos_y: composePayload.overlay_pos_y,
          video_pos_x: composePayload.video_pos_x ?? videoPos.x,
          video_pos_y: composePayload.video_pos_y ?? videoPos.y,
          ig_bg_color: composePayload.ig_bg_color,
          ig_text_color: composePayload.ig_text_color,
          ig_avatar_size: composePayload.ig_avatar_size,
          ig_username_size: composePayload.ig_username_size,
          ig_caption_size: composePayload.ig_caption_size,
          format_presets: patch.format_presets ?? formatCacheRef.current,
        });
      } catch {
        /* ignore */
      }
    },
    [jobId, style, wordsPerLine, exportFormat, position, highlightEnabled, compose, videoPos, settingsReady],
  );

  useEffect(() => {
    if (!settingsReady) return;
    formatCacheRef.current[exportFormat] = snapshotFromState(position, style, compose, videoPos);
    const t = setTimeout(() => {
      persistSettings({ format_presets: { ...formatCacheRef.current } });
    }, 800);
    return () => clearTimeout(t);
  }, [style, wordsPerLine, exportFormat, compose, position, videoPos, highlightEnabled, settingsReady, persistSettings]);

  const handleFormatChange = useCallback(
    (fmt: ExportFormatId) => {
      if (fmt === exportFormat) return;

      formatCacheRef.current[exportFormat] = snapshotFromState(position, style, compose, videoPos);

      const { aspect: nextAspect, template: nextTemplate } = formatToBackend(fmt);
      const vw = wordsData?.width ?? 1920;
      const vh = wordsData?.height ?? 1080;

      const cached = formatCacheRef.current[fmt];
      const snap = cached ?? defaultSnapshotForFormat(fmt, templates, vw, vh, style, compose);
      const applied = applyFormatSnapshot(snap);

      setExportFormat(fmt);
      setAspect(nextAspect);
      setPosition(applied.position);
      setStyle((s) => ({ ...s, ...applied.style }));
      setCompose(applied.compose);
      setVideoPos(applied.videoPos);

      formatCacheRef.current[fmt] = snap;

      void persistSettings({
        aspect: nextAspect,
        template: nextTemplate,
        style: { ...style, ...applied.style },
        ...composeToSettingsPatch(applied.compose),
        format_presets: { ...formatCacheRef.current },
      });
    },
    [exportFormat, position, style, compose, videoPos, wordsData, templates, persistSettings],
  );

  const handleComposeChange = useCallback(
    (patch: Partial<ComposeSettings>) => {
      if ("overlay_asset" in patch && activeClipId) {
        persistClips(
          clipList.map((c) =>
            c.id === activeClipId
              ? { ...c, overlay_asset: patch.overlay_asset ?? null }
              : c,
          ),
        );
        return;
      }
      setCompose((c) => ({ ...c, ...patch }));
      void persistSettings(patch);
    },
    [activeClipId, clipList, persistClips, persistSettings],
  );

  const handleVideoPosChange = useCallback(
    (pos: { x: number; y: number }) => {
      setVideoPos(pos);
      handleComposeChange({ video_pos_x: pos.x, video_pos_y: pos.y });
    },
    [handleComposeChange],
  );

  const handleOverlayPosChange = useCallback(
    (pos: { x: number; y: number }) => {
      handleComposeChange({ overlay_pos_x: pos.x, overlay_pos_y: pos.y });
    },
    [handleComposeChange],
  );

  const validateComposeBeforeRender = useCallback(
    (clip?: ClipSegment): string | null => {
      if (!isComposeFormat(exportFormat)) return null;
      const overlay = clip?.overlay_asset ?? compose.overlay_asset;
      if (needsOverlay(exportFormat) && !overlay) {
        return clip
          ? `O corte "${clip.title.slice(0, 24)}" precisa de mídia de overlay.`
          : "Este formato exige mídia de overlay — envie na aba Composição.";
      }
      return null;
    },
    [exportFormat, compose.overlay_asset],
  );

  const handleSyncEditing = useCallback(async () => {
    if (!activeClipId) {
      setError("Selecione um corte como referência.");
      return;
    }
    setSyncingEdits(true);
    setSyncMessage(null);
    setError(null);
    try {
      formatCacheRef.current[exportFormat] = snapshotFromState(position, style, compose, videoPos);
      await persistSettings({ format_presets: { ...formatCacheRef.current } });
      const r = await syncClipsEditing(jobId, activeClipId);
      clipWordsCache.current = {};
      clipKeywordsCache.current = {};
      const parts = [
        `Estilo de legenda aplicado a ${r.synced} corte(s).`,
        "Título e imagem de cada corte continuam individuais.",
      ];
      if (r.highlight_enabled && r.keywords_synced > 0) {
        parts.push(`Destaques detectados em ${r.keywords_synced} corte(s).`);
      }
      setSyncMessage(parts.join(" "));
      if (activeClipId) {
        const kw = await getClipKeywords(jobId, activeClipId).catch(() => null);
        if (kw) setClipKeywords(kw.indices ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setSyncingEdits(false);
    }
  }, [
    activeClipId,
    jobId,
    exportFormat,
    position,
    style,
    compose,
    videoPos,
    persistSettings,
  ]);

  const handleClipTextChange = useCallback(
    (text: string) => {
      if (!activeClipId) return;
      const field = "headline";
      persistClips(
        clipList.map((c) => (c.id === activeClipId ? { ...c, [field]: text } : c)),
      );
    },
    [activeClipId, clipList, persistClips],
  );

  const applyDetectResult = useCallback(async (r: Awaited<ReturnType<typeof getClips>>) => {
    const list = r.clips ?? [];
    setDetectClipCount(list.length);
    setDetectPhase("success");
    await new Promise((resolve) => window.setTimeout(resolve, 1100));
    setClipList(list);
    clipWordsCache.current = {};
    if (list.length) setActiveClipId(list[0].id);
    if (r.detect_error) {
      setError(r.detect_error);
    } else if (!list.length) {
      setError("Nenhum corte encontrado — tente de novo ou ajuste manualmente.");
    }
    setDetecting(false);
    setDetectPhase("working");
  }, []);

  const runDetectPoll = useCallback(
    async (startNew: boolean) => {
      setDetecting(true);
      setDetectPhase("working");
      setDetectClipCount(0);
      setError(null);
      try {
        const r = startNew
          ? await waitForClips(jobId)
          : await pollForClips(jobId);
        await applyDetectResult(r);
      } catch (e: unknown) {
        setDetecting(false);
        setDetectPhase("working");
        setError(e instanceof Error ? e.message : "Falha ao detectar cortes");
      }
    },
    [jobId, applyDetectResult],
  );

  useEffect(() => {
    if (!settingsReady || !resumeDetectRef.current) return;
    resumeDetectRef.current = false;
    void runDetectPoll(false);
  }, [settingsReady, runDetectPoll]);

  const handleDetect = () => {
    void runDetectPoll(true);
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
    videoControlsRef.current?.seek(getClipPreviewStart(clip));
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
      if (!previewClip) return;
      videoControlsRef.current?.seek(exportTimeToSourceTime(previewClip, clipRelativeS));
    },
    [previewClip],
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

  const renderBody = (clip?: ClipSegment) => {
    const { aspect: a, template } = formatToBackend(exportFormat);
    return {
      aspect: a,
      template,
      preset: null as string | null,
      custom: { ...style, pos_x: position.x, pos_y: position.y },
      words_per_line: wordsPerLine,
      resolution: "1080p" as const,
      highlight_enabled: highlightEnabled,
      overlay_asset: clip?.overlay_asset ?? compose.overlay_asset,
      profile_asset: compose.profile_asset,
      instagram_username: compose.instagram_username,
      logo_asset: compose.logo_asset,
      logo_x: compose.logo_x,
      logo_y: compose.logo_y,
      logo_scale: compose.logo_scale,
      progress_enabled: compose.progress_enabled,
      progress_color: compose.progress_color,
      progress_height_pct: compose.progress_height_pct,
      headline_style: compose.headline_style,
      headline_bg: compose.headline_bg,
      headline_color: compose.headline_color,
      headline_font_size: compose.headline_font_size,
      headline_align: compose.headline_align,
      headline_max_width_pct: compose.headline_max_width_pct,
      overlay_pos_x: compose.overlay_pos_x,
      overlay_pos_y: compose.overlay_pos_y,
      video_pos_x: videoPos.x,
      video_pos_y: videoPos.y,
      ig_bg_color: compose.ig_bg_color,
      ig_text_color: compose.ig_text_color,
      ig_avatar_size: compose.ig_avatar_size,
      ig_username_size: compose.ig_username_size,
      ig_caption_size: compose.ig_caption_size,
    };
  };

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
    const clip = clipList.find((c) => c.id === clipId);
    const composeErr = validateComposeBeforeRender(clip);
    if (composeErr) {
      setError(composeErr);
      return;
    }
    setRenderingIds((prev) => new Set(prev).add(clipId));
    setClipList((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, status: "rendering" as const } : c)),
    );
    setError(null);
    try {
      await renderSingleClip(jobId, clipId, renderBody(clip));
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
    const enabled = clipList.filter((c) => c.enabled);
    const ids = enabled.map((c) => c.id);
    if (!ids.length) {
      setError("Selecione ao menos um corte.");
      return;
    }
    for (const c of enabled) {
      const composeErr = validateComposeBeforeRender(c);
      if (composeErr) {
        setError(composeErr);
        return;
      }
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

      {error && (
        <div className="mb-3 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden pb-28 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="order-1 flex max-h-[55dvh] min-h-[180px] min-h-0 flex-col overflow-hidden sm:max-h-[60dvh] lg:order-none lg:max-h-full lg:min-h-[240px]">
          {step >= 2 && highlightEnabled && (
            <p className="mb-1 shrink-0 text-center text-[10px] text-accent">
              {clipKeywords.length > 0
                ? `Destaques ativos — ${clipKeywords.length} palavra(s) · dê play no trecho`
                : "Destaques ligados — aba Destaques → Detectar com IA"}
            </p>
          )}
          {wordsData && step >= 2 && activeTemplate && isComposeFormat(exportFormat) ? (
            <TemplatePreview
              jobId={jobId}
              template={activeTemplate}
              overlayAsset={compose.overlay_asset ?? null}
              words={previewWords}
              style={{ ...style, pos_x: position.x, pos_y: position.y }}
              wordsPerLine={wordsPerLine}
              currentTime={currentTime}
              duration={previewClip ? getClipExportDuration(previewClip) : job?.duration}
              progressTime={
                previewClip
                  ? (() => {
                      const t = sourceTimeToExportTime(previewClip, currentTime);
                      if (t == null) return undefined;
                      return Math.max(0, Math.min(getClipExportDuration(previewClip), t));
                    })()
                  : undefined
              }
              highlightEnabled={highlightEnabled}
              highlightPhrases={highlightPhrases}
              compose={previewCompose}
              videoPos={videoPos}
              onVideoPosChange={handleVideoPosChange}
              onOverlayPosChange={handleOverlayPosChange}
              onLogoPosChange={(p) => handleComposeChange({ logo_x: p.x, logo_y: p.y })}
              registerControls={(c) => (videoControlsRef.current = c)}
            />
          ) : wordsData ? (
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
                previewClip && previewActiveSegment
                  ? { start: previewActiveSegment.start_s, end: previewActiveSegment.end_s }
                  : previewClip
                    ? { start: previewClip.start_s, end: previewClip.end_s }
                    : null
              }
              videoObjectFit={step >= 2 && exportFormat !== "original" ? "cover" : "contain"}
            />
          ) : null}
          {step >= 2 && (
            <p className="mt-1 shrink-0 text-center text-xs text-muted">
              Preview — arraste a legenda{activeTemplate ? " · formato composto" : ""}
            </p>
          )}
        </div>

        <aside className="order-2 flex h-full min-h-0 max-h-full flex-col overflow-hidden rounded-xl border border-border bg-panel lg:order-none">
          {step === 1 && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
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
              <ClipBoundsEditor clip={activeClip} onChange={handleClipChange} />
            </div>
          )}

          {step !== 1 && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {(step === 2 || step === 3) && wordsData && (
                <div className="flex flex-col">
                  {step === 2 && (
                    <>
                  <div className="sticky top-0 z-10 border-b border-border bg-accent/5 px-4 py-3 text-sm text-zinc-300">
                    Corte{" "}
                    <span className="font-semibold text-accent">
                      {enabledClips.findIndex((c) => c.id === activeClipId) + 1 || 1}
                    </span>{" "}
                    de {enabledClips.length}
                  </div>

                  {enabledClips.length > 1 && (
                    <div className="flex flex-wrap gap-2 border-b border-border p-3">
                      {enabledClips.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveClipId(c.id)}
                          className={`min-h-[36px] rounded-lg px-3 py-1.5 text-sm ${
                            c.id === activeClipId
                              ? "bg-accent/10 font-medium text-accent ring-1 ring-accent/25"
                              : "bg-border/50 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {c.title.slice(0, 28)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3 p-3">
                    <Section step={1} title="Formato do vídeo" description="Proporção e template de exportação">
                      <ClipFormatPicker
                        format={exportFormat}
                        onChange={handleFormatChange}
                        compact
                      />
                    </Section>

                    {isComposeFormat(exportFormat) && (
                      <Section step={2} title="Composição" description="Headline, mídia e barra de progresso">
                        <ClipComposePanel
                          jobId={jobId}
                          format={exportFormat}
                          compose={previewCompose}
                          onComposeChange={handleComposeChange}
                          clipText={previewClip?.headline ?? ""}
                          onClipTextChange={handleClipTextChange}
                          clipTextLabel="Headline do corte"
                        />
                      </Section>
                    )}

                    <Section
                      step={isComposeFormat(exportFormat) ? 3 : 2}
                      title="Estilo da legenda"
                      description="Estilo, destaques e texto — sincronize para todos os cortes"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => void handleSyncEditing()}
                          disabled={syncingEdits || !activeClipId || enabledClips.length < 2}
                          className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/15 disabled:opacity-50"
                          title="Usa o corte selecionado como referência"
                        >
                          {syncingEdits ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          Sincronizar legenda para todos
                        </button>
                        <span className="text-xs text-muted">
                          Título e imagem do topo ficam por corte
                        </span>
                      </div>
                      {syncMessage && (
                        <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                          {syncMessage}
                        </p>
                      )}
                      <TabBar
                        tabs={[
                          { id: "style" as const, label: "Estilo", shortLabel: "Estilo" },
                          {
                            id: "highlights" as const,
                            label: "Destaques",
                            shortLabel: "Dest.",
                          },
                          { id: "text" as const, label: "Texto", shortLabel: "Texto" },
                        ]}
                        active={step2Tab}
                        onChange={setStep2Tab}
                        className="-mx-1 mb-0 rounded-lg border border-border"
                      />
                    </Section>
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
                            activeClip ? exportTimeToSourceTime(activeClip, t) : t,
                          )
                        }
                        currentTime={
                          activeClip
                            ? (sourceTimeToExportTime(activeClip, currentTime) ?? 0)
                            : currentTime
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
                        format={exportFormat}
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
            <p className="mb-2 text-center text-xs text-muted">
              Etapa {step} de 3 — use o botão amarelo abaixo da tela
            </p>
          </div>
        </aside>
      </div>

      {/* Barra fixa — SEMPRE visível em qualquer tela */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t-2 border-accent/40 bg-[#121214]/98 px-3 py-3 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md sm:px-5">
        <div className="mx-auto flex max-w-[1920px] items-center gap-3">
          <div className="hidden min-w-0 flex-1 text-sm text-muted sm:block">
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
                className="touch-target flex items-center justify-center gap-1 rounded-lg border border-border px-4 py-3 text-sm text-zinc-300 hover:bg-border/40"
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
                className="touch-target flex min-w-[200px] flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-bg shadow-lg shadow-accent/20 disabled:opacity-50 sm:flex-none"
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

      <ClipDetectOverlay
        open={detecting}
        phase={detectPhase}
        clipCount={detectClipCount}
      />
    </div>
  );
}
