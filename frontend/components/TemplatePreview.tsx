"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Move } from "lucide-react";
import { assetUrl, type ComposeSettings, type TemplateInfo, type Word, type StyleConfig } from "@/lib/api";
import KaraokeLine, { heroOutlineStyle } from "@/components/KaraokeLine";
import { activePhrase, inHighlightEffectWindow, type HighlightPhrase } from "@/lib/highlightPhrases";
import { fakeProgress } from "@/lib/fakeProgress";
import {
  clampHeadlineWidthPct,
  clampProgressHeightPct,
  headlineBoxBorder,
  headlineDisplayText,
  headlineFontSize,
  layoutHeadlineLines,
} from "@/lib/composeLayout";
import {
  findActiveGroup,
  fontFamilyCss,
  isWordActive,
} from "@/lib/subtitleLayout";
import { fitHeroPhrase } from "@/lib/heroLayout";
import { hexWithAlpha } from "@/lib/colorAlpha";
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
  duration?: number;
  /** Clip-relative time for progress bar (cortes preview). Defaults to video currentTime. */
  progressTime?: number;
  highlightEnabled?: boolean;
  highlightPhrases?: HighlightPhrase[];
  videoPos?: { x: number; y: number };
  onVideoPosChange?: (pos: { x: number; y: number }) => void;
  compose?: ComposeSettings;
  onLogoPosChange?: (pos: { x: number; y: number }) => void;
  onOverlayPosChange?: (pos: { x: number; y: number }) => void;
  registerControls?: (c: { seek: (t: number) => void; getCurrentTime: () => number }) => void;
};

export default function TemplatePreview({
  jobId, template, overlayAsset, words, style, wordsPerLine, currentTime,
  duration = 0, progressTime,
  highlightEnabled = false, highlightPhrases = [],
  videoPos, onVideoPosChange, compose, onLogoPosChange, onOverlayPosChange, registerControls,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const overlayWrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [overlayDragging, setOverlayDragging] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [scaleY, setScaleY] = useState(0.45);
  const [frameWidth, setFrameWidth] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const tpl = template;
  const aspectRatio = tpl.width / tpl.height;
  const vp = videoPos ?? { x: 0.5, y: 0.5 };
  const isHstack = tpl.layout === "header_hstack";
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

  const dur = duration > 0 ? duration : videoDuration;
  const progressT = progressTime ?? videoTime;
  const progressPct = compose?.progress_enabled && dur > 0
    ? fakeProgress(progressT, dur) * 100
    : 0;

  useEffect(() => {
    if (registerControls && videoRef.current) {
      registerControls({
        seek: (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      });
    }
  }, [registerControls]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => setVideoDuration(v.duration || 0);
    const onTime = () => setVideoTime(v.currentTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [jobId]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => {
      setFrameWidth(el.clientWidth);
      setScaleY(Math.max(0.001, el.clientHeight / tpl.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tpl.height]);

  const subYpct = (tpl.subtitle_safe_y / tpl.height) * 100;
  const subXpct = ((tpl.subtitle_safe_x ?? tpl.width / 2) / tpl.width) * 100;

  const isImage = overlayAsset && /\.(png|jpe?g|webp|gif|bmp)$/i.test(overlayAsset);
  const isVideo = overlayAsset && !isImage && /\.(mp4|mov|mkv|webm|m4v)$/i.test(overlayAsset);

  const headlineRaw = compose?.headline_text ?? "";
  const headlineStyle = compose?.headline_style ?? "bold_red";
  const headlineWidthPct = clampHeadlineWidthPct(compose?.headline_max_width_pct);
  const headlineAlign = compose?.headline_align ?? "center";
  const headlineFs = headlineFontSize(compose?.headline_font_size);
  const headlineBorder = headlineBoxBorder(headlineStyle);
  const headlineCssFs = Math.max(10, Math.round(headlineFs * scaleY));
  const headlinePad = Math.max(4, Math.round(headlineBorder * scaleY));
  const headlinePadX = Math.round(headlinePad * 0.85);
  const headlineDisplay = headlineRaw.trim()
    ? headlineDisplayText(headlineRaw, headlineStyle)
    : "";
  const headlineWrapped = useMemo(() => {
    if (!headlineDisplay || frameWidth <= 0) return headlineDisplay;
    const innerW = Math.max(20, frameWidth * headlineWidthPct - headlinePadX * 2);
    return layoutHeadlineLines(headlineDisplay, innerW, headlineCssFs).join("\n");
  }, [headlineDisplay, frameWidth, headlineWidthPct, headlinePadX, headlineCssFs]);
  const progressHeightPct = clampProgressHeightPct(compose?.progress_height_pct);
  const showHeadline = Boolean(headlineWrapped && !isHstack && tpl.id.startsWith("choquei_"));
  const divPct = isHstack ? 0 : (tpl.overlay_region.h / tpl.height) * 100;
  const overlayPos = {
    x: compose?.overlay_pos_x ?? 0.5,
    y: compose?.overlay_pos_y ?? 0.5,
  };
  const overlayStyle = { objectPosition: `${overlayPos.x * 100}% ${overlayPos.y * 100}%` as const };
  const hdrH = tpl.header_region?.h ?? 538;
  const igBg = compose?.ig_bg_color ?? "#FFFFFF";
  const igText = compose?.ig_text_color ?? "#141414";
  const igAvatarPx = Math.max(28, Math.round((compose?.ig_avatar_size ?? 72) * (scaleY * 0.55)));
  const igUserPx = Math.max(10, Math.round((compose?.ig_username_size ?? 34) * scaleY * 0.42));
  const igCaptionPx = Math.max(9, Math.round((compose?.ig_caption_size ?? 28) * scaleY * 0.38));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onVideoPosChange) return;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateVideoFromPointer(e);
  };
  const updateVideoFromPointer = (e: React.PointerEvent) => {
    const wrap = videoWrapRef.current;
    if (!wrap || !onVideoPosChange) return;
    const rect = wrap.getBoundingClientRect();
    onVideoPosChange({
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    });
  };

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (!onOverlayPosChange) return;
    e.stopPropagation();
    setOverlayDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateOverlayFromPointer(e);
  };
  const updateOverlayFromPointer = (e: React.PointerEvent) => {
    const wrap = overlayWrapRef.current;
    if (!wrap || !onOverlayPosChange) return;
    const rect = wrap.getBoundingClientRect();
    onOverlayPosChange({
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    });
  };

  const handleLogoPointerDown = (e: React.PointerEvent) => {
    if (!onLogoPosChange) return;
    e.stopPropagation();
    setLogoDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const updateLogoFromPointer = (e: React.PointerEvent) => {
    const frame = frameRef.current;
    if (!frame || !onLogoPosChange) return;
    const rect = frame.getBoundingClientRect();
    onLogoPosChange({
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    });
  };

  const renderMedia = (className: string) => (
    overlayAsset ? (
      isImage ? (
        <img src={assetUrl(jobId, overlayAsset)} alt="" className={className} style={overlayStyle} />
      ) : isVideo ? (
        <video src={assetUrl(jobId, overlayAsset)} className={className} style={overlayStyle} loop muted autoPlay playsInline />
      ) : null
    ) : (
      <div className={`flex flex-col items-center justify-center gap-1 text-zinc-600 ${className}`}>
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs">Mídia</span>
      </div>
    )
  );

  return (
    <div
      ref={frameRef}
      className="relative mx-auto bg-black"
      style={{ aspectRatio: `${aspectRatio}`, maxHeight: "100%", maxWidth: "100%", height: "100%" }}
    >
      {isHstack ? (
        <div
          className="absolute inset-0 flex flex-col transition-[filter] duration-200"
          style={{ filter: highlightBlur ? "blur(14px) brightness(0.72) saturate(0.75)" : "none" }}
        >
          <div
            className="relative shrink-0 px-4 py-3"
            style={{
              height: `${(hdrH / tpl.height) * 100}%`,
              backgroundColor: igBg,
            }}
          >
            <div className="flex items-start gap-3">
              {compose?.profile_asset ? (
                <img
                  src={assetUrl(jobId, compose.profile_asset)}
                  alt=""
                  className="shrink-0 rounded-full object-cover"
                  style={{ width: igAvatarPx, height: igAvatarPx }}
                />
              ) : (
                <div className="shrink-0 rounded-full bg-zinc-200" style={{ width: igAvatarPx, height: igAvatarPx }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold" style={{ fontSize: igUserPx, color: igText }}>
                  {compose?.instagram_username || "usuario"}
                </p>
                <p className="mt-2 line-clamp-4 leading-snug" style={{ fontSize: igCaptionPx, color: igText }}>
                  {compose?.instagram_caption || "Caption do post..."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <div
              ref={overlayWrapRef}
              className={`relative w-1/2 overflow-hidden bg-zinc-900 ${onOverlayPosChange ? "cursor-move ring-inset hover:ring-2 hover:ring-accent/35" : ""}`}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={(e) => overlayDragging && updateOverlayFromPointer(e)}
              onPointerUp={() => setOverlayDragging(false)}
            >
              {renderMedia("h-full w-full object-cover")}
              {onOverlayPosChange && (
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-sm text-zinc-200 backdrop-blur-sm">
                  <Move className="h-4 w-4 shrink-0 text-accent" />
                  Arraste mídia
                </div>
              )}
            </div>
            <div
              ref={videoWrapRef}
              className={`relative w-1/2 overflow-hidden bg-black ${onVideoPosChange ? "cursor-move ring-inset hover:ring-2 hover:ring-accent/35" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={(e) => dragging && updateVideoFromPointer(e)}
              onPointerUp={() => setDragging(false)}
            >
              <video
                ref={videoRef}
                src={`/api/jobs/${jobId}/video`}
                className="h-full w-full object-cover"
                style={{ objectPosition: `${vp.x * 100}% ${vp.y * 100}%` }}
                playsInline
                onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
              />
              {onVideoPosChange && (
                <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-sm text-zinc-200 backdrop-blur-sm">
                  <Move className="h-4 w-4 shrink-0 text-accent" />
                  Arraste para enquadrar
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="absolute inset-0 grid transition-[filter] duration-200"
          style={{
            gridTemplateRows: `${tpl.overlay_region.h / tpl.height * 100}% ${tpl.video_region.h / tpl.height * 100}%`,
            filter: highlightBlur ? "blur(14px) brightness(0.72) saturate(0.75)" : "none",
          }}
        >
          <div
            ref={overlayWrapRef}
            className={`relative overflow-hidden bg-zinc-900 ${onOverlayPosChange ? "cursor-move ring-inset hover:ring-2 hover:ring-accent/35" : ""}`}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={(e) => overlayDragging && updateOverlayFromPointer(e)}
            onPointerUp={() => setOverlayDragging(false)}
          >
            {renderMedia("h-full w-full object-cover")}
            {onOverlayPosChange && (
              <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-sm text-zinc-200 backdrop-blur-sm">
                <Move className="h-4 w-4 shrink-0 text-accent" />
                Arraste mídia
              </div>
            )}
          </div>
          <div
            ref={videoWrapRef}
            className={`relative overflow-hidden bg-black ${onVideoPosChange ? "cursor-move ring-inset hover:ring-2 hover:ring-accent/35" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={(e) => dragging && updateVideoFromPointer(e)}
            onPointerUp={() => setDragging(false)}
          >
            <video
              ref={videoRef}
              src={`/api/jobs/${jobId}/video`}
              className="h-full w-full object-cover"
              style={{ objectPosition: `${vp.x * 100}% ${vp.y * 100}%` }}
              playsInline
              onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
            />
            {onVideoPosChange && (
              <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-sm text-zinc-200 backdrop-blur-sm">
                <Move className="h-4 w-4 shrink-0 text-accent" />
                Arraste para enquadrar
              </div>
            )}
          </div>
        </div>
      )}

      {showHeadline && (
        <div
          className="pointer-events-none absolute z-20 font-bold"
          style={{
            top: `${divPct}%`,
            width: `${headlineWidthPct * 100}%`,
            boxSizing: "border-box",
            left: headlineAlign === "left" ? "2%" : headlineAlign === "right" ? "auto" : "50%",
            right: headlineAlign === "right" ? "2%" : "auto",
            transform: headlineAlign === "center" ? "translate(-50%, -50%)" : "translateY(-50%)",
            fontSize: `${headlineCssFs}px`,
            fontFamily: 'var(--font-roboto), sans-serif',
            fontWeight: 700,
            lineHeight: 1.15,
            padding: `${headlinePad}px ${headlinePadX}px`,
            whiteSpace: "pre-wrap",
            wordBreak: "normal",
            overflowWrap: "break-word",
            background: headlineStyle === "bold_red" ? (compose?.headline_bg ?? "#E31B23") : "rgba(0,0,0,0.85)",
            color: compose?.headline_color ?? "#fff",
            textAlign: headlineAlign,
          }}
        >
          {headlineWrapped}
        </div>
      )}

      {active && active.length > 0 && !showHero && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{
            left: `${subXpct}%`,
            top: `${subYpct}%`,
            overflow: "visible",
            zIndex: 25,
          }}
        >
          <span style={{
            padding: style.box ? "0.1em 0.4em" : "0",
            background: style.box
              ? hexWithAlpha(style.box_color, style.box_opacity ?? 0.5)
              : "transparent",
            borderRadius: style.box ? "4px" : "0",
            display: "inline-block",
          }}>
            <KaraokeLine words={active} style={style} scaleY={scaleY} activeIndex={lineActiveIdx} />
          </span>
        </div>
      )}

      {showHero && heroLayout && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 30, padding: "0 8%" }}>
          <p style={{
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
          }}>
            {heroLayout.text}
          </p>
        </div>
      )}

      {compose?.logo_asset && (
        <img
          src={assetUrl(jobId, compose.logo_asset)}
          alt=""
          draggable={false}
          className={`absolute z-30 ${onLogoPosChange ? "cursor-move" : ""}`}
          style={{
            left: `${(compose.logo_x ?? 0.85) * 100}%`,
            top: `${(compose.logo_y ?? 0.78) * 100}%`,
            width: `${(compose.logo_scale ?? 0.18) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={handleLogoPointerDown}
          onPointerMove={(e) => logoDragging && updateLogoFromPointer(e)}
          onPointerUp={() => setLogoDragging(false)}
        />
      )}

      {compose?.progress_enabled && (
        <div
          className="absolute bottom-0 left-0 z-40 w-full overflow-hidden"
          style={{
            height: `${progressHeightPct * 100}%`,
            background: "rgba(255,255,255,0.12)",
          }}
        >
          <div
            className="h-full max-w-full"
            style={{
              width: `${Math.min(100, Math.max(0, progressPct))}%`,
              background: compose.progress_color ?? "#E31B23",
            }}
          />
        </div>
      )}
    </div>
  );
}