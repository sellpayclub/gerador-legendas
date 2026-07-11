"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Move } from "lucide-react";
import type { StyleConfig, Word } from "@/lib/api";
import { videoUrl } from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import { useAccessToken } from "@/lib/useAccessToken";
import KaraokeLine, { heroOutlineStyle } from "@/components/KaraokeLine";
import {
  findActiveGroup,
  fontFamilyCss,
  isWordActive,
} from "@/lib/subtitleLayout";
import { activePhrase, inHighlightEffectWindow, type HighlightPhrase } from "@/lib/highlightPhrases";
import { fitHeroPhrase, heroCssFontSize } from "@/lib/heroLayout";
import { hexWithAlpha } from "@/lib/colorAlpha";
import {
  DEFAULT_PAUSE_THRESHOLD_S,
  groupWordsByPause,
  trimWordEnds,
} from "@/lib/timing";
import { fakeProgress } from "@/lib/fakeProgress";
import { clampProgressHeightPct } from "@/lib/composeLayout";
import type { ComposeSettings } from "@/lib/api";

/** Shown on the preview while transcription is pending or returned empty. */
const PLACEHOLDER_WORDS: Word[] = [
  { w: "sua", start: 0, end: 0.35 },
  { w: "legenda", start: 0.35, end: 0.7 },
  { w: "aqui", start: 0.7, end: 1.05 },
];

type Props = {
  jobId: string;
  width: number;
  height: number;
  words: Word[];
  style: StyleConfig;
  wordsPerLine: number;
  onPositionChange: (pos: { x: number; y: number }) => void;
  position: { x: number | null; y: number | null };
  registerControls?: (controls: {
    seek: (t: number, opts?: { play?: boolean }) => void;
    play: () => void;
    pause: () => void;
    getCurrentTime: () => number;
  }) => void;
  /** Limit video height to fit viewport (editor split layout). */
  compact?: boolean;
  /** Override max-height in compact mode (e.g. when parent constrains height). */
  compactMaxHeight?: string;
  /** Dramatic highlight: big centered phrase + blur (only when enabled). */
  highlightEnabled?: boolean;
  highlightPhrases?: HighlightPhrase[];
  /** Active clip range for Cortes mode — highlights scrubber region. */
  activeClip?: { start: number; end: number } | null;
  /** When "cover", simulates 9:16 crop (vertical export preview). */
  videoObjectFit?: "contain" | "cover";
  compose?: ComposeSettings;
  progressTime?: number;
};

/**
 * Video preview with custom controls + draggable subtitle overlay.
 * The overlay is positioned in PlayResX/Y coordinate space; CSS pixels are
 * converted by scaling against the rendered <video> element's bounding box.
 *
 * A static "preview" group is always shown (the first group of words) with
 * the first word highlighted, so the user can see style changes immediately
 * even before hitting play.
 */
export default function VideoPreview({
  jobId,
  width,
  height,
  words,
  style,
  wordsPerLine,
  onPositionChange,
  position,
  registerControls,
  isPlaceholder = false,
  compact = false,
  compactMaxHeight,
  highlightEnabled = false,
  highlightPhrases = [],
  activeClip = null,
  videoObjectFit = "contain",
  compose,
  progressTime,
}: Props & { isPlaceholder?: boolean }) {
  const accessToken = useAccessToken();
  const hosted = isMultiTenant();
  const mainVideoSrc = useMemo(() => {
    if (hosted && !accessToken) return null;
    return videoUrl(jobId, accessToken);
  }, [jobId, accessToken, hosted]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [videoRect, setVideoRect] = useState<{ w: number; h: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const displayWords = useMemo(
    () => (words.length > 0 ? trimWordEnds(words) : PLACEHOLDER_WORDS),
    [words],
  );
  const pauseThreshold = style.pause_threshold_s ?? DEFAULT_PAUSE_THRESHOLD_S;

  const groups = useMemo(
    () => groupWordsByPause(displayWords, wordsPerLine, pauseThreshold),
    [displayWords, wordsPerLine, pauseThreshold],
  );

  const { group: activeGroup, activeIdx: previewActiveIdx } = useMemo(
    () => findActiveGroup(groups, displayWords, currentTime, { staticPreview: true }),
    [groups, displayWords, currentTime],
  );

  const scaleX = videoRect ? videoRect.w / width : 0.45;
  const scaleY = videoRect ? Math.max(0.001, videoRect.h / height) : 0.45;

  const defaultPos = { x: width / 2, y: height - style.margin_v };
  const pos = {
    x: position.x ?? defaultPos.x,
    y: position.y ?? defaultPos.y,
  };

  // Observe video size
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => {
      setVideoRect({ w: v.clientWidth, h: v.clientHeight });
      setDuration(v.duration || 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    v.addEventListener("loadedmetadata", update);
    return () => {
      ro.disconnect();
      v.removeEventListener("loadedmetadata", update);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", () => setDuration(v.duration || 0));
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    if (!registerControls) return;
    registerControls({
      seek: (t: number, opts?: { play?: boolean }) => {
        const v = videoRef.current;
        if (v) {
          v.currentTime = t;
          setCurrentTime(t);
          if (opts?.play) v.play().catch(() => {});
        }
      },
      play: () => {
        videoRef.current?.play().catch(() => {});
      },
      pause: () => {
        videoRef.current?.pause();
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    });
  }, [registerControls]);

  useEffect(() => {
    videoRef.current?.pause();
    setPlaying(false);
  }, [jobId]);

  // Drag handling
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const overlay = overlayRef.current;
      if (!overlay || !videoRect) return;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: pos.x,
        baseY: pos.y,
      };
      overlay.setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y, videoRect]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ds = dragState.current;
      if (!ds || !videoRect) return;
      const dx = (e.clientX - ds.startX) / scaleX;
      const dy = (e.clientY - ds.startY) / scaleY;
      const nx = Math.max(0, Math.min(width, ds.baseX + dx));
      const ny = Math.max(0, Math.min(height, ds.baseY + dy));
      onPositionChange({ x: nx, y: ny });
    },
    [scaleX, scaleY, width, height, videoRect, onPositionChange]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragState.current = null;
    overlayRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const overlayCssX = pos.x * scaleX;
  const overlayCssY = pos.y * scaleY;

  const playbackTime = progressTime ?? currentTime;
  const progressPct = compose?.progress_enabled && duration > 0
    ? fakeProgress(Math.max(0, playbackTime), duration) * 100
    : 0;

  const renderGroup = () => {
    if (!activeGroup) return null;
    if (showHero) return null;
    const groupActiveIdx = activeGroup.findIndex(
      (w) => isWordActive(w, playbackTime) || displayWords.indexOf(w) === previewActiveIdx,
    );
    return (
      <KaraokeLine
        words={activeGroup}
        style={style}
        scaleY={scaleY}
        activeIndex={groupActiveIdx}
      />
    );
  };

  const hero = highlightEnabled ? activePhrase(highlightPhrases, currentTime) : null;
  const highlightBlur =
    highlightEnabled && inHighlightEffectWindow(highlightPhrases, currentTime);
  const heroLayout = hero ? fitHeroPhrase(hero.text, width, height) : null;
  const heroCssFs =
    hero && heroLayout && videoRect
      ? heroCssFontSize(heroLayout.text, heroLayout.fontSize, videoRect.w, videoRect.h, width, height)
      : 0;
  const showHero = Boolean(hero && heroLayout && videoRect && heroCssFs > 0);

  // Custom controls
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seekRel = (dt: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + dt));
  };
  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (v) v.currentTime = +e.target.value;
  };

  const isPortrait = height > width;
  const defaultCompactMax = "calc(70dvh - 4rem)";
  const effectiveMaxHeight = compactMaxHeight ?? (compact ? defaultCompactMax : "100%");
  const effectiveMaxWidth = (!isPortrait && compact) ? "400px" : "100%";

  return (
    <div className={`flex w-full flex-col gap-2 ${compact ? "h-full max-h-full items-center" : ""}`}>
      <div
        ref={frameRef}
        className={`relative overflow-hidden rounded-xl bg-black shadow-lg ${compact ? "mx-auto shrink-0" : "mx-auto"}`}
        style={{ 
          aspectRatio: `${width} / ${height}`,
          maxHeight: effectiveMaxHeight,
          maxWidth: effectiveMaxWidth,
          height: isPortrait ? "100%" : "auto",
          width: isPortrait ? "auto" : "100%",
        }}
      >
        {/* Invisible SVG element to force correct aspect-ratio scaling bounds */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="pointer-events-none invisible block"
          style={{
            width: isPortrait ? "auto" : "100%",
            height: isPortrait ? "100%" : "auto",
          }}
          aria-hidden="true"
        />
        {mainVideoSrc ? (
          <video
            key={mainVideoSrc}
            ref={videoRef}
            src={mainVideoSrc}
            className={`absolute inset-0 h-full w-full transition-[filter] duration-200 ${
              videoObjectFit === "cover" ? "object-cover" : "object-contain"
            }`}
            style={{
              filter: highlightBlur ? "blur(16px) brightness(0.72) saturate(0.75)" : "none",
            }}
            playsInline
            preload="auto"
            onClick={togglePlay}
          />
        ) : (
          <div className="absolute inset-0 flex h-full min-h-[120px] w-full items-center justify-center text-sm text-zinc-500">
            Carregando vídeo…
          </div>
        )}

        {/* Hero phrase — big, centered */}
        {showHero && heroLayout && videoRect && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ zIndex: 20, padding: "0 8%" }}
          >
            <p
              style={{
                fontFamily: fontFamilyCss(style.font),
                fontSize: heroCssFs,
                color: style.primary_color,
                fontWeight: 800,
                textAlign: "center",
                lineHeight: 1.1,
                width: "100%",
                maxWidth: `${videoRect.w * 0.84}px`,
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                ...heroOutlineStyle(style, scaleY),
              }}
            >
              {heroLayout.text}
            </p>
          </div>
        )}

        {activeGroup && !showHero && (
          <div
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute touch-none cursor-grab select-none active:cursor-grabbing hover:ring-2 hover:ring-accent/40 focus-visible:ring-2 focus-visible:ring-accent/50"
            style={{
              left: overlayCssX,
              top: overlayCssY,
              transform: "translate(-50%, -50%)",
              fontFamily: fontFamilyCss(style.font),
              lineHeight: 1.15,
              textAlign: "center",
              whiteSpace: "nowrap",
              maxWidth: "92%",
              background: style.box
                ? hexWithAlpha(style.box_color, style.box_opacity)
                : "transparent",
              padding: style.box
                ? `${Math.max(4, style.font_size * scaleY * 0.12)}px ${Math.max(8, style.font_size * scaleY * 0.2)}px`
                : 0,
              borderRadius: style.box ? Math.max(4, style.font_size * scaleY * 0.08) : 0,
              pointerEvents: "auto",
              zIndex: 10,
            }}
          >
            {renderGroup()}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm sm:text-[11px]">
          <Move className="h-3 w-3 shrink-0 text-accent" />
          {isPlaceholder
            ? "Arraste (transcrição em andamento)"
            : "Arraste legenda"}
        </div>

        {/* Progress Bar Fake (Espelhado do TemplatePreview) */}
        {compose?.progress_enabled && (
          <div
            className="absolute bottom-0 left-0 z-50 pointer-events-none"
            style={{
              height: `${clampProgressHeightPct(compose.progress_height_pct) * 100}%`,
              width: `${Math.min(100, Math.max(0, progressPct))}%`,
              backgroundColor: compose.progress_color || "#E31B23",
              transition: "width 0.1s linear",
            }}
          />
        )}
      </div>

      {/* Custom controls */}
      <div className={`relative flex shrink-0 items-center gap-2 rounded-xl border border-border bg-panel/80 px-2.5 py-2 shadow-sm backdrop-blur-sm ${compact ? "w-full max-w-md" : "w-full"}`}>
        <button onClick={() => seekRel(-5)} className="text-zinc-400 transition hover:text-zinc-100" title="-5s">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-black transition hover:bg-accent/90" title="Play/Pause">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button onClick={() => seekRel(5)} className="text-zinc-400 transition hover:text-zinc-100" title="+5s">
          <SkipForward className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(currentTime, duration || 0)}
          onChange={onSeek}
          className="relative z-10 flex-1 accent-[var(--accent)]"
        />
        {activeClip && duration > 0 && (
          <div
            className="pointer-events-none absolute left-[calc(2.5rem+0.5rem)] right-16 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-700/80"
            aria-hidden
          >
            <div
              className="absolute h-full rounded-full bg-accent/40"
              style={{
                left: `${(activeClip.start / duration) * 100}%`,
                width: `${((activeClip.end - activeClip.start) / duration) * 100}%`,
              }}
            />
          </div>
        )}
        <span className="text-xs tabular-nums text-zinc-500">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}

function fmtTime(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
