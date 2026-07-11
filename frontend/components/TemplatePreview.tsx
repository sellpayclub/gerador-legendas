"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Image as ImageIcon, Move, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { assetUrl, videoUrl, type ComposeSettings, type TemplateInfo, type Word, type StyleConfig } from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import { useAccessToken } from "@/lib/useAccessToken";
import KaraokeLine, { heroOutlineStyle } from "@/components/KaraokeLine";
import { activePhrase, inHighlightEffectWindow, type HighlightPhrase } from "@/lib/highlightPhrases";
import { fakeProgress } from "@/lib/fakeProgress";
import {
  clampHeadlineWidthPct,
  clampProgressHeightPct,
  headlineBoxBorder,
  headlineBorderRadius,
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
import { clampSubtitlePosition, resolveSubtitlePosition } from "@/lib/subtitlePosition";

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
  onSubtitlePositionChange?: (pos: { x: number; y: number }) => void;
  registerControls?: (c: {
    seek: (t: number, opts?: { play?: boolean }) => void;
    play: () => void;
    pause: () => void;
    getCurrentTime: () => number;
  }) => void;
  /** Fit inside split layouts (cortes sidebar). */
  compact?: boolean;
  compactMaxHeight?: string;
};

export default function TemplatePreview({
  jobId, template, overlayAsset, words, style, wordsPerLine, currentTime,
  duration = 0, progressTime,
  highlightEnabled = false, highlightPhrases = [],
  videoPos, onVideoPosChange, compose, onLogoPosChange, onOverlayPosChange,
  onSubtitlePositionChange, registerControls,
  compact = false,
  compactMaxHeight,
}: Props) {
  const accessToken = useAccessToken();
  const hosted = isMultiTenant();
  const mainVideoSrc = useMemo(() => {
    if (hosted && !accessToken) return null;
    return videoUrl(jobId, accessToken);
  }, [jobId, accessToken, hosted]);
  const canLoadAssets = !hosted || Boolean(accessToken);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const overlayWrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const subtitleDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overlayDragging, setOverlayDragging] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [subtitleDragging, setSubtitleDragging] = useState(false);
  const [scaleY, setScaleY] = useState(0.45);
  const [frameWidth, setFrameWidth] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tpl = template;
  const vp = videoPos ?? { x: 0.5, y: 0.5 };
  const isHstack = tpl.layout === "header_hstack";
  const isFullBleed = !isHstack && tpl.overlay_region.h <= 0;
  const isPortraitTpl = tpl.height >= tpl.width;
  const defaultCompactMax = "calc(70dvh - 4rem)";
  const defaultFullMax = "calc(100dvh - 13rem)";
  const effectiveMaxHeight = compactMaxHeight ?? (compact ? defaultCompactMax : defaultFullMax);
  const effectiveMaxWidth = (!isPortraitTpl && compact) ? "400px" : (!isPortraitTpl && !compact) ? "600px" : "100%";
  /** Prefer parent-polled time (stable across overlay/template updates). */
  const playbackTime = progressTime ?? currentTime;
  const hero = highlightEnabled ? activePhrase(highlightPhrases, playbackTime) : null;
  const highlightBlur =
    highlightEnabled && inHighlightEffectWindow(highlightPhrases, playbackTime);
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
    () => findActiveGroup(groups, timedWords, playbackTime, { staticPreview: true }),
    [groups, timedWords, playbackTime],
  );

  const lineActiveIdx = active
    ? active.findIndex((w) => isWordActive(w, playbackTime))
    : -1;

  const dur = duration > 0 ? duration : videoDuration;
  const progressT = progressTime ?? currentTime;
  const progressPct = compose?.progress_enabled && dur > 0
    ? fakeProgress(Math.max(0, progressT), dur) * 100
    : 0;

  useEffect(() => {
    if (!registerControls) return;
    registerControls({
      seek: (t: number, opts?: { play?: boolean }) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = t;
        setVideoTime(t);
        if (opts?.play) v.play().catch(() => {});
      },
      play: () => {
        videoRef.current?.play().catch(() => {});
      },
      pause: () => {
        videoRef.current?.pause();
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    });
  }, [registerControls, mainVideoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
  }, [jobId, mainVideoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => setVideoDuration(v.duration || 0);
    const onTime = () => setVideoTime(v.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [jobId, mainVideoSrc]);

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

  const resolvedSub = useMemo(
    () => resolveSubtitlePosition(
      style,
      { x: style.pos_x ?? null, y: style.pos_y ?? null },
      tpl.width,
      tpl.height,
      {
        x: tpl.subtitle_safe_x ?? tpl.width / 2,
        y: tpl.subtitle_safe_y,
      },
    ),
    [style, tpl.width, tpl.height, tpl.subtitle_safe_x, tpl.subtitle_safe_y],
  );

  const subYpct = (resolvedSub.y / tpl.height) * 100;
  const subXpct = (resolvedSub.x / tpl.width) * 100;

  const effectiveOverlay = overlayAsset ?? compose?.overlay_asset ?? null;
  const isImage = effectiveOverlay && /\.(png|jpe?g|webp|gif|bmp)$/i.test(effectiveOverlay);
  const isVideo = effectiveOverlay && !isImage && /\.(mp4|mov|mkv|webm|m4v)$/i.test(effectiveOverlay);

  const headlineRaw = compose?.headline_text ?? "";
  const headlineStyle = compose?.headline_style ?? "bold_red";
  const headlineWidthPct = clampHeadlineWidthPct(compose?.headline_max_width_pct);
  const headlineAlign = compose?.headline_align ?? "center";
  const headlineFs = headlineFontSize(compose?.headline_font_size);
  const headlineBorder = headlineBoxBorder(headlineStyle);
  const headlineRadius = headlineBorderRadius(headlineStyle, scaleY);
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

  const headerHeightPct = (hdrH / tpl.height) * 100;
  const overlayHeightPct = (tpl.overlay_region.h / tpl.height) * 100;
  const videoTopPct = (tpl.video_region.y / tpl.height) * 100;
  const videoHeightPct = (tpl.video_region.h / tpl.height) * 100;
  const showOverlayRegion = !isFullBleed && tpl.overlay_region.h > 0;
  const bodyTopPct = isHstack ? headerHeightPct : 0;

  const overlayRegionStyle: CSSProperties = isHstack
    ? { top: `${bodyTopPct}%`, left: 0, width: "50%", height: `${100 - bodyTopPct}%` }
    : { top: 0, left: 0, right: 0, height: `${overlayHeightPct}%` };

  const videoRegionStyle: CSSProperties = isHstack
    ? { top: `${bodyTopPct}%`, right: 0, width: "50%", height: `${100 - bodyTopPct}%` }
    : isFullBleed
      ? { inset: 0 }
      : { top: `${videoTopPct}%`, left: 0, right: 0, height: `${videoHeightPct}%` };

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

  const handleSubtitlePointerDown = (e: React.PointerEvent) => {
    if (!onSubtitlePositionChange) return;
    e.stopPropagation();
    setSubtitleDragging(true);
    subtitleDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: resolvedSub.x,
      baseY: resolvedSub.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const updateSubtitleFromPointer = (e: React.PointerEvent) => {
    const ds = subtitleDragRef.current;
    const frame = frameRef.current;
    if (!ds || !frame || !onSubtitlePositionChange) return;
    const rect = frame.getBoundingClientRect();
    const scaleXFrame = tpl.width / Math.max(1, rect.width);
    const scaleYFrame = tpl.height / Math.max(1, rect.height);
    const dx = (e.clientX - ds.startX) * scaleXFrame;
    const dy = (e.clientY - ds.startY) * scaleYFrame;
    const next = clampSubtitlePosition(
      { x: ds.baseX + dx, y: ds.baseY + dy },
      tpl.width,
      tpl.height,
      style.margin_v ?? 120,
    );
    onSubtitlePositionChange(next);
  };

  const renderMedia = (className: string) => {
    if (!canLoadAssets) {
      return (
        <div className={`flex items-center justify-center text-xs text-zinc-600 ${className}`}>
          Carregando…
        </div>
      );
    }
    return effectiveOverlay ? (
      isImage ? (
        <img key={effectiveOverlay} src={assetUrl(jobId, effectiveOverlay, accessToken)} alt="" className={className} style={overlayStyle} />
      ) : isVideo ? (
        <video key={effectiveOverlay} src={assetUrl(jobId, effectiveOverlay, accessToken)} className={className} style={overlayStyle} loop muted autoPlay playsInline preload="auto" />
      ) : null
    ) : (
      <div className={`flex flex-col items-center justify-center gap-1 text-zinc-600 ${className}`}>
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs">Mídia</span>
      </div>
    );
  };

  const scrubDuration = dur > 0 ? dur : videoDuration;
  const scrubTime = Math.min(videoTime, scrubDuration || videoTime);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seekRel = (dt: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(scrubDuration || v.duration || 0, v.currentTime + dt));
  };
  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = +e.target.value;
    setVideoTime(+e.target.value);
  };

  return (
    <div className={`flex w-full min-h-0 flex-col items-center gap-1.5 ${compact ? "h-full max-h-full flex-1" : "h-full"}`}>
    <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
    <div
      ref={frameRef}
      className="relative mx-auto shrink-0 overflow-hidden rounded-xl bg-black shadow-lg"
      style={{ 
        aspectRatio: `${tpl.width} / ${tpl.height}`,
        maxHeight: effectiveMaxHeight,
        maxWidth: effectiveMaxWidth,
        height: isPortraitTpl ? "100%" : "auto",
        width: isPortraitTpl ? "auto" : "100%",
      }}
    >
      {/* Invisible SVG element to force correct aspect-ratio scaling bounds */}
      <svg
        viewBox={`0 0 ${tpl.width} ${tpl.height}`}
        className="pointer-events-none invisible block"
        style={{
          width: isPortraitTpl ? "auto" : "100%",
          height: isPortraitTpl ? "100%" : "auto",
        }}
        aria-hidden="true"
      />
      {isHstack && (
        <div
          className="absolute left-0 right-0 top-0 z-10 shrink-0 px-4 py-3"
          style={{
            height: `${headerHeightPct}%`,
            backgroundColor: igBg,
          }}
        >
          <div className="flex items-start gap-3">
            {compose?.profile_asset && canLoadAssets ? (
              <img
                src={assetUrl(jobId, compose.profile_asset, accessToken)}
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
      )}

      <div
        className="absolute left-0 right-0 bottom-0 transition-[filter] duration-200"
        style={{
          top: isHstack ? `${bodyTopPct}%` : 0,
          filter: highlightBlur ? "blur(14px) brightness(0.72) saturate(0.75)" : "none",
        }}
      >
        {showOverlayRegion && (
          <div
            ref={overlayWrapRef}
            className={`absolute overflow-hidden bg-zinc-900 ${onOverlayPosChange ? "cursor-move ring-inset hover:ring-2 hover:ring-accent/35" : ""}`}
            style={overlayRegionStyle}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={(e) => overlayDragging && updateOverlayFromPointer(e)}
            onPointerUp={() => setOverlayDragging(false)}
          >
            {renderMedia("h-full w-full object-cover")}
            {onOverlayPosChange && (
              <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm sm:text-[11px]">
                <Move className="h-3 w-3 shrink-0 text-accent" />
                Mídia
              </div>
            )}
          </div>
        )}

        <div
          ref={videoWrapRef}
          className={`absolute overflow-hidden bg-black ${onVideoPosChange ? "cursor-move ring-inset hover:ring-2 hover:ring-accent/35" : ""}`}
          style={videoRegionStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => dragging && updateVideoFromPointer(e)}
          onPointerUp={() => setDragging(false)}
        >
          {mainVideoSrc ? (
            <video
              key={mainVideoSrc}
              ref={videoRef}
              src={mainVideoSrc}
              className="h-full w-full object-cover"
              style={{ objectPosition: `${vp.x * 100}% ${vp.y * 100}%` }}
              playsInline
              preload="auto"
              onClick={togglePlay}
            />
          ) : (
            <div className="flex h-full min-h-[80px] items-center justify-center text-sm text-zinc-500">
              Carregando vídeo…
            </div>
          )}
          {onVideoPosChange && (
            <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm sm:text-[11px]">
              <Move className="h-3 w-3 shrink-0 text-accent" />
              Enquadrar
            </div>
          )}
        </div>
      </div>

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
            fontFamily: 'var(--font-roboto), "Noto Color Emoji", sans-serif',
            fontWeight: 700,
            lineHeight: 1.2,
            padding: `${headlinePad}px ${headlinePadX}px`,
            whiteSpace: "pre-wrap",
            wordBreak: "normal",
            overflowWrap: "break-word",
            background: compose?.headline_bg ?? (headlineStyle === "bold_red" ? "#E31B23" : "#000000"),
            color: compose?.headline_color ?? "#fff",
            textAlign: headlineAlign,
            borderRadius: `${headlineRadius}px`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {headlineWrapped}
        </div>
      )}

      {active && active.length > 0 && !showHero && (
        <div
          className={`absolute -translate-x-1/2 -translate-y-1/2 text-center ${
            onSubtitlePositionChange ? "cursor-move touch-none" : "pointer-events-none"
          }`}
          style={{
            left: `${subXpct}%`,
            top: `${subYpct}%`,
            overflow: "visible",
            zIndex: 25,
          }}
          onPointerDown={handleSubtitlePointerDown}
          onPointerMove={(e) => subtitleDragging && updateSubtitleFromPointer(e)}
          onPointerUp={() => {
            setSubtitleDragging(false);
            subtitleDragRef.current = null;
          }}
        >
          {onSubtitlePositionChange && (
            <div className="pointer-events-none absolute -top-7 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm sm:text-[11px]">
              <Move className="h-3 w-3 text-accent" />
              Legenda
            </div>
          )}
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

      {compose?.logo_asset && canLoadAssets && (
        <img
          src={assetUrl(jobId, compose.logo_asset, accessToken)}
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
    </div>

    <div className="flex w-full max-w-md shrink-0 items-center gap-2 rounded-xl border border-border bg-panel/80 px-2.5 py-2 shadow-sm backdrop-blur-sm sm:px-3">
      <button type="button" onClick={() => seekRel(-5)} className="text-zinc-400 transition hover:text-zinc-100" title="-5s">
        <SkipBack className="h-4 w-4" />
      </button>
      <button type="button" onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-black transition hover:bg-accent/90" title="Play/Pause">
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      <button type="button" onClick={() => seekRel(5)} className="text-zinc-400 transition hover:text-zinc-100" title="+5s">
        <SkipForward className="h-4 w-4" />
      </button>
      <input
        type="range"
        min={0}
        max={scrubDuration || 0}
        step={0.05}
        value={scrubTime}
        onChange={onScrub}
        className="min-w-0 flex-1 accent-[var(--accent)]"
      />
      <span className="hidden shrink-0 text-xs tabular-nums text-zinc-500 sm:inline">
        {fmtPreviewTime(scrubTime)} / {fmtPreviewTime(scrubDuration)}
      </span>
    </div>
    </div>
  );
}

function fmtPreviewTime(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}