"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { StyleConfig, Word } from "@/lib/api";
import { subtitleTextStyle, fontFamilyCss } from "@/lib/subtitleLayout";

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
  registerControls?: (controls: { seek: (t: number) => void; getCurrentTime: () => number }) => void;
  /** Limit video height to fit viewport (editor split layout). */
  compact?: boolean;
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
}: Props & { isPlaceholder?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [videoRect, setVideoRect] = useState<{ w: number; h: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const displayWords = words.length > 0 ? words : PLACEHOLDER_WORDS;

  const scaleX = videoRect ? videoRect.w / width : 1;
  const scaleY = videoRect ? videoRect.h / height : 1;

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
      seek: (t: number) => {
        const v = videoRef.current;
        if (v) {
          v.currentTime = t;
          v.play().catch(() => {});
        }
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    });
  }, [registerControls]);

  // Build word groups (same logic as backend)
  const groups: Word[][] = [];
  for (let i = 0; i < displayWords.length; i += wordsPerLine) {
    groups.push(displayWords.slice(i, i + wordsPerLine));
  }

  // Active word at current time
  const activeIdx = displayWords.findIndex(
    (w) => currentTime >= w.start - 0.01 && currentTime < w.end
  );

  // Choose group to display:
  // - If playing and an active word exists, show the group containing it
  // - Otherwise show the group whose time range contains currentTime
  // - Otherwise show the first group as a static preview
  let activeGroup: Word[] | null = null;
  let previewActiveIdx = -1;
  if (activeIdx >= 0) {
    for (const g of groups) {
      if (displayWords.indexOf(g[0]) <= activeIdx && activeIdx < displayWords.indexOf(g[0]) + g.length) {
        activeGroup = g;
        previewActiveIdx = activeIdx;
        break;
      }
    }
  }
  if (!activeGroup) {
    for (const g of groups) {
      if (g[0].start <= currentTime + 0.05 && g[g.length - 1].end >= currentTime - 0.5) {
        activeGroup = g;
      }
    }
  }
  if (!activeGroup && groups.length > 0) {
    // Static preview: first group, first word highlighted so user sees the highlight color
    activeGroup = groups[0];
    previewActiveIdx = displayWords.indexOf(groups[0][0]);
  }

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

  const renderGroup = () => {
    if (!activeGroup) return null;
    return activeGroup.map((w, i) => {
      const wordGlobalIdx = displayWords.indexOf(w);
      const isActive = wordGlobalIdx === previewActiveIdx;
      const color = isActive ? style.primary_color : style.secondary_color;
      const label = (w.w || "").trim();
      if (!label) return null;
      return (
        <span
          key={i}
          style={subtitleTextStyle(style, scaleY, {
            color,
            isActive,
            isLastInGroup: i === activeGroup!.length - 1,
          })}
        >
          {label}
        </span>
      );
    });
  };

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
  const videoFrameStyle: React.CSSProperties = compact
    ? {
        aspectRatio: `${width} / ${height}`,
        maxHeight: "min(calc(100dvh - 11rem), 100%)",
        width: isPortrait ? "auto" : "100%",
        maxWidth: "100%",
      }
    : { aspectRatio: `${width} / ${height}` };

  return (
    <div className={`flex w-full flex-col gap-2 ${compact ? "h-full max-h-full items-center" : ""}`}>
      <div
        className={`relative overflow-hidden rounded-xl bg-black ${compact ? "mx-auto shrink-0" : "w-full"}`}
        style={videoFrameStyle}
      >
        <video
          ref={videoRef}
          src={`/api/jobs/${jobId}/video`}
          className="h-full w-full object-contain"
          playsInline
          onClick={togglePlay}
        />

        {videoRect && activeGroup && (
          <div
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute touch-none cursor-grab select-none active:cursor-grabbing"
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

        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-zinc-400">
          {isPlaceholder
            ? "Preview — arraste para posicionar (transcrição em andamento)"
            : "Arraste a legenda para reposicionar"}
        </div>
      </div>

      {/* Custom controls */}
      <div className={`flex shrink-0 items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 ${compact ? "w-full max-w-md" : "w-full"}`}>
        <button onClick={() => seekRel(-5)} className="text-zinc-400 hover:text-zinc-100" title="-5s">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={togglePlay} className="text-zinc-100 hover:text-accent" title="Play/Pause">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button onClick={() => seekRel(5)} className="text-zinc-400 hover:text-zinc-100" title="+5s">
          <SkipForward className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(currentTime, duration || 0)}
          onChange={onSeek}
          className="flex-1"
        />
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

function hexWithAlpha(hex: string, alpha: number): string {
  const s = hex.replace("#", "");
  let r = "0",
    g = "0",
    b = "0";
  if (s.length === 6) {
    r = s.slice(0, 2);
    g = s.slice(2, 4);
    b = s.slice(4, 6);
  }
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}
