"use client";

import { useEffect, useRef } from "react";
import { Image as ImageIcon } from "lucide-react";
import { assetUrl, type TemplateInfo, type Word, type StyleConfig } from "@/lib/api";

type Props = {
  jobId: string;
  template: TemplateInfo;
  overlayAsset: string | null;
  words: Word[];
  style: StyleConfig;
  wordsPerLine: number;
  currentTime: number;
  registerControls?: (c: { seek: (t: number) => void; getCurrentTime: () => number }) => void;
};

/**
 * CSS-based preview of the composed template output.
 * Shows the overlay region on top, the original video cover-cropped in the
 * video region, and a live subtitle overlay positioned at subtitle_safe_y.
 * Not pixel-perfect with FFmpeg, but close enough to guide the user.
 */
export default function TemplatePreview({
  jobId, template, overlayAsset, words, style, wordsPerLine, currentTime, registerControls,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tpl = template;
  const aspectRatio = tpl.width / tpl.height;

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
  const active = activeLine(grouped, currentTime);

  // Map template coords to preview-relative coords.
  // subtitle_safe_y is in template pixels; preview uses percentage of height.
  const subYpct = (tpl.subtitle_safe_y / tpl.height) * 100;

  const isImage = overlayAsset && /\.(png|jpe?g|webp|gif|bmp)$/i.test(overlayAsset);
  const isVideo = overlayAsset && !isImage && /\.(mp4|mov|mkv|webm|m4v)$/i.test(overlayAsset);

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

        {/* Video region (bottom) — original video cover-cropped */}
        <div className="relative overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={`/api/jobs/${jobId}/video`}
            className="h-full w-full object-cover"
            controls={false}
            playsInline
            onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
          />
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
            }}
          >
            {active.map((w, i) => {
              const isActive = currentTime >= w.start && currentTime <= w.end;
              return (
                <span
                  key={i}
                  style={{
                    color: isActive ? style.primary_color : style.secondary_color,
                    marginRight: `${(style.word_spacing ?? 4) * 0.4}px`,
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

function activeLine(groups: Word[][], t: number): Word[] | null {
  for (const g of groups) {
    if (g.length === 0) continue;
    const start = g[0].start;
    const end = g[g.length - 1].end + 0.1;
    if (t >= start && t <= end) return g;
  }
  return null;
}
