"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Move } from "lucide-react";
import { assetUrl, type TemplateInfo, type Word, type StyleConfig } from "@/lib/api";
import KaraokeLine, { heroOutlineStyle } from "@/components/KaraokeLine";
import { activePhrase, inHighlightEffectWindow, type HighlightPhrase } from "@/lib/highlightPhrases";
import {
  findActiveGroup,
  fontFamilyCss,
  isWordActive,
} from "@/lib/subtitleLayout";
import { fitHeroPhrase } from "@/lib/heroLayout";
import {
  DEFAULT_PAUSE_THRESHOLD_S,
  groupWordsByPause,
  trimWordEnds,
} from "@/lib/timing";

type Props = {
  jobId: string;
  template: TemplateInfo;
  overlayAsset: string | null;
  words: Word[];
  style: StyleConfig;
  wordsPerLine: number;
  currentTime: number;
  highlightEnabled?: boolean;
  highlightPhrases?: HighlightPhrase[];
  videoPos?: { x: number; y: number };
  onVideoPosChange?: (pos: { x: number; y: number }) => void;
  registerControls?: (c: { seek: (t: number) => void; getCurrentTime: () => number }) => void;
};

export default function TemplatePreview({
  jobId, template, overlayAsset, words, style, wordsPerLine, currentTime,
  highlightEnabled = false, highlightPhrases = [],
  videoPos, onVideoPosChange, registerControls,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scaleY, setScaleY] = useState(0.45);
  const tpl = template;
  const aspectRatio = tpl.width / tpl.height;
  const vp = videoPos ?? { x: 0.5, y: 0.5 };
  const hero = highlightEnabled ? activePhrase(highlightPhrases, currentTime) : null;
  const highlightBlur =
    highlightEnabled && inHighlightEffectWindow(highlightPhrases, currentTime);
  const heroLayout = hero ? fitHeroPhrase(hero.text, tpl.width, tpl.height) : null;
  const heroCssFs = heroLayout ? Math.max(14, Math.round(heroLayout.fontSize * 0.42)) : 0;
  const showHero = Boolean(hero && heroLayout && heroCssFs > 0);
  const timedWords = useMemo(() => trimWordEnds(words), [words]);
  const pauseThreshold = style.pause_threshold_s ?? DEFAULT_PAUSE_THRESHOLD_S;

  const groups = useMemo(
    () => groupWordsByPause(timedWords, wordsPerLine, pauseThreshold),
    [timedWords, wordsPerLine, pauseThreshold],
  );

  const { group: active } = useMemo(
    () => findActiveGroup(groups, timedWords, currentTime, { staticPreview: true }),
    [groups, timedWords, currentTime],
  );

  const lineActiveIdx = active
    ? active.findIndex((w) => isWordActive(w, currentTime))
    : -1;

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

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setScaleY(el.clientHeight / tpl.height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tpl.height]);

  const subYpct = (tpl.subtitle_safe_y / tpl.height) * 100;

  const isImage = overlayAsset && /\.(png|jpe?g|webp|gif|bmp)$/i.test(overlayAsset);
  const isVideo = overlayAsset && !isImage && /\.(mp4|mov|mkv|webm|m4v)$/i.test(overlayAsset);

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
      ref={frameRef}
      className="relative mx-auto bg-black"
      style={{
        aspectRatio: `${aspectRatio}`,
        maxHeight: "100%",
        maxWidth: "100%",
        height: "100%",
      }}
    >
      <div
        className="absolute inset-0 grid transition-[filter] duration-200"
        style={{
          gridTemplateRows: `${tpl.overlay_region.h / tpl.height * 100}% ${tpl.video_region.h / tpl.height * 100}%`,
          filter: highlightBlur ? "blur(14px) brightness(0.72) saturate(0.75)" : "none",
        }}
      >
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

      {active && active.length > 0 && !showHero && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ top: `${subYpct}%`, overflow: "visible" }}
        >
          <span
            style={{
              padding: style.box ? "0.1em 0.4em" : "0",
              background: style.box ? `${style.box_color}` : "transparent",
              borderRadius: style.box ? "4px" : "0",
              display: "inline-block",
            }}
          >
            <KaraokeLine
              words={active}
              style={style}
              scaleY={scaleY}
              activeIndex={lineActiveIdx}
            />
          </span>
        </div>
      )}

      {showHero && heroLayout && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 30, padding: "0 8%" }}>
          <p
            style={{
              fontFamily: fontFamilyCss(style.font),
              fontSize: heroCssFs,
              color: style.primary_color,
              fontWeight: 800,
              textAlign: "center",
              lineHeight: 1.1,
              width: "100%",
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
    </div>
  );
}
