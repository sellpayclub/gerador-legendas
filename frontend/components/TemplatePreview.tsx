"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Move } from "lucide-react";
import { assetUrl, type TemplateInfo, type Word, type StyleConfig } from "@/lib/api";

type Props = {
  jobId: string;
  template: TemplateInfo;
  overlayAsset: string | null;
  words: Word[];
  style: StyleConfig;
  wordsPerLine: number;
  currentTime: number;
  keywords?: number[];
  videoPos?: { x: number; y: number };
  onVideoPosChange?: (pos: { x: number; y: number }) => void;
  registerControls?: (c: { seek: (t: number) => void; getCurrentTime: () => number }) => void;
};

/**
 * CSS-based preview of the composed template output.
 * - Overlay region on top (uploaded image/video)
 * - Video region on bottom (original video, cover-cropped, draggable to reframe)
 * - Subtitle overlay at subtitle_safe_y with per-word karaoke + keyword pop
 *
 * Not pixel-perfect with FFmpeg, but mirrors the layout closely enough to
 * guide the user — and now shows the keyword zoom effect live.
 */
export default function TemplatePreview({
  jobId, template, overlayAsset, words, style, wordsPerLine, currentTime,
  keywords, videoPos, onVideoPosChange, registerControls,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const tpl = template;
  const aspectRatio = tpl.width / tpl.height;
  const kwSet = new Set(keywords ?? []);
  const vp = videoPos ?? { x: 0.5, y: 0.5 };

  useEffect(() => {
    if (registerControls && videoRef.current) {
      registerControls({
        seek: (t: number) => {
          if (videoRef.current) videoRef.current.currentTime = t;
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      });
    }
  }, [registerControls]);

  // Build the active line of words at currentTime (same grouping as backend).
  const grouped = groupWords(words, wordsPerLine);
  const { active, activeStartIdx } = activeLine(grouped, currentTime);

  // Map template coords to preview-relative coords.
  const subYpct = (tpl.subtitle_safe_y / tpl.height) * 100;

  const isImage = overlayAsset && /\.(png|jpe?g|webp|gif|bmp)$/i.test(overlayAsset);
  const isVideo = overlayAsset && !isImage && /\.(mp4|mov|mkv|webm|m4v)$/i.test(overlayAsset);

  // Drag-to-reframe the video inside the video region.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onVideoPosChange) return;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };
  const updateFromPointer = (e: React.PointerEvent) => {
    const wrap = videoWrapRef.current;
    if (!wrap || !onVideoPosChange) return;
    const rect = wrap.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    onVideoPosChange({
      x: Math.max(0, Math.min(1, px)),
      y: Math.max(0, Math.min(1, py)),
    });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    updateFromPointer(e);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  return (
    <div
      className="relative mx-auto bg-black"
      style={{
        aspectRatio: `${aspectRatio}`,
        maxHeight: "100%",
        maxWidth: "100%",
        height: "100%",
      }}
    >
      <div className="absolute inset-0 grid" style={{ gridTemplateRows: `${tpl.overlay_region.h / tpl.height * 100}% ${tpl.video_region.h / tpl.height * 100}%` }}>
        {/* Overlay region (top) */}
        <div className="relative overflow-hidden bg-zinc-900">
          {overlayAsset ? (
            isImage ? (
              <img src={assetUrl(jobId, overlayAsset)} alt="" className="h-full w-full object-cover" />
            ) : isVideo ? (
              <video
                src={assetUrl(jobId, overlayAsset)}
                className="h-full w-full object-cover"
                loop muted autoPlay playsInline
              />
            ) : null
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-zinc-600">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">Mídia do template</span>
            </div>
          )}
        </div>

        {/* Video region (bottom) — original video cover-cropped, draggable */}
        <div
          ref={videoWrapRef}
          className={`relative overflow-hidden bg-black ${onVideoPosChange ? "cursor-move" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <video
            ref={videoRef}
            src={`/api/jobs/${jobId}/video`}
            className="h-full w-full object-cover"
            style={{ objectPosition: `${vp.x * 100}% ${vp.y * 100}%` }}
            controls={false}
            playsInline
            onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
          />
          {onVideoPosChange && (
            <div className={`pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-zinc-300 transition-opacity ${dragging ? "opacity-100" : "opacity-60"}`}>
              <Move className="h-3 w-3" /> arraste pra enquadrar
            </div>
          )}
        </div>
      </div>

      {/* Subtitle overlay (anchored at subtitle_safe_y of the canvas) */}
      {active && active.length > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ top: `${subYpct}%` }}
        >
          <span
            style={{
              fontFamily: style.font,
              fontSize: `clamp(14px, ${style.font_size * 0.5}px, 36px)`,
              color: style.secondary_color,
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? "italic" : "normal",
              letterSpacing: `${(style.letter_spacing ?? 0) * 0.5}px`,
              textShadow: style.outline_width > 0
                ? `0 0 ${Math.max(2, style.outline_width * 0.3)}px ${style.outline_color}, 0 0 ${Math.max(2, style.outline_width * 0.3)}px ${style.outline_color}, 0 0 ${Math.max(2, style.outline_width * 0.3)}px ${style.outline_color}`
                : "none",
              padding: style.box ? "0.1em 0.4em" : "0",
              background: style.box ? `${style.box_color}` : "transparent",
              borderRadius: style.box ? "4px" : "0",
              display: "inline-flex",
              gap: `${(style.word_spacing ?? 4) * 0.4}px`,
            }}
          >
            {active.map((w, i) => {
              const globalIdx = activeStartIdx + i;
              const isKw = kwSet.has(globalIdx);
              const isActive = currentTime >= w.start && currentTime <= w.end;
              // Keyword pop: when this keyword word is being spoken, scale it up.
              const kwScale = (style.keyword_scale ?? 180) / 100;
              const scale = isKw && isActive ? kwScale : 1.0;
              const color = isActive
                ? (isKw ? (style.primary_color) : style.primary_color)
                : style.secondary_color;
              return (
                <span
                  key={i}
                  style={{
                    color,
                    transform: `scale(${scale})`,
                    display: "inline-block",
                    transformOrigin: "center bottom",
                    transition: "transform 120ms ease-out, color 80ms linear",
                    fontWeight: isKw ? 800 : (style.bold ? 700 : 400),
                  }}
                >
                  {w.w}
                </span>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function groupWords(words: Word[], n: number): Word[][] {
  if (n <= 1) return words.map(w => [w]);
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += n) out.push(words.slice(i, i + n));
  return out;
}

function activeLine(groups: Word[][], t: number): { active: Word[] | null; activeStartIdx: number } {
  let idx = 0;
  for (const g of groups) {
    if (g.length === 0) continue;
    const start = g[0].start;
    const end = g[g.length - 1].end + 0.1;
    if (t >= start && t <= end) return { active: g, activeStartIdx: idx };
    idx += g.length;
  }
  return { active: null, activeStartIdx: 0 };
}
