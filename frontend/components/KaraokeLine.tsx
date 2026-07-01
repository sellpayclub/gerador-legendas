"use client";

import type { CSSProperties } from "react";
import type { StyleConfig, Word } from "@/lib/api";
import { captionOutlineStyle } from "@/lib/outlineStyle";
import { fontFamilyCss, playResToCss, wordLabel } from "@/lib/subtitleLayout";

type WordNode = {
  key: number;
  label: string;
  color: string;
  spanStyle: CSSProperties;
};

type Props = {
  words: Word[];
  style: StyleConfig;
  scaleY: number;
  /** Index inside `words` of the active token, or -1. */
  activeIndex: number;
};

function buildWordNodes(words: Word[], style: StyleConfig, activeIndex: number): WordNode[] {
  const spaceCount = 1 + Math.floor((style.word_spacing ?? 4) / 4);
  const wordGapEm = spaceCount * 0.28;
  const nodes: WordNode[] = [];

  words.forEach((w, i) => {
    const label = wordLabel(w, style.text_case);
    if (!label) return;
    const isActive = i === activeIndex;
    nodes.push({
      key: i,
      label,
      color: isActive ? style.primary_color : style.secondary_color,
      spanStyle: {
        marginRight: i === words.length - 1 ? 0 : `${wordGapEm}em`,
        display: isActive && style.animation === "pop" ? "inline-block" : "inline",
        transform:
          isActive && style.animation === "pop"
            ? `scale(${style.pop_scale / 100})`
            : undefined,
        transition:
          isActive && style.animation === "pop" ? "transform 80ms ease-out" : undefined,
      },
    });
  });

  return nodes;
}

function typography(style: StyleConfig, scaleY: number): CSSProperties {
  const fs = playResToCss(style.font_size, scaleY);
  const ls = playResToCss(style.letter_spacing ?? 2, scaleY);
  return {
    fontSize: fs,
    fontFamily: fontFamilyCss(style.font),
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    letterSpacing: `${ls}px`,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
  };
}

/** One subtitle line — per-word stroke so outline stays visible with karaoke colours. */
export default function KaraokeLine({ words, style, scaleY, activeIndex }: Props) {
  const nodes = buildWordNodes(words, style, activeIndex);
  if (nodes.length === 0) return null;

  const type = typography(style, scaleY);
  const showOutline = !style.box && style.outline_width > 0;

  return (
    <span className="inline-block" style={{ ...type, overflow: "visible" }}>
      {nodes.map(({ key, label, color, spanStyle }) => (
        <span
          key={key}
          style={{
            ...spanStyle,
            ...(showOutline ? captionOutlineStyle(style, scaleY, color) : { color }),
          }}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/** Solid outline for single-line hero text (matches libass \\bord). */
export function heroOutlineStyle(style: StyleConfig, scaleY: number): CSSProperties {
  return captionOutlineStyle(style, scaleY);
}
