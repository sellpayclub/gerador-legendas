"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { detectKeywords, saveKeywords, detectClipKeywords, saveClipKeywords, type Word } from "@/lib/api";
import { groupHighlightPhrases } from "@/lib/highlightPhrases";
import Section from "@/components/ui/Section";

type Props = {
  jobId: string;
  words: Word[];
  highlightEnabled: boolean;
  onHighlightEnabledChange: (v: boolean) => void;
  keywords: number[];
  onKeywordsChange: (indices: number[]) => void;
  /** When set, detect/save keywords for this clip only (Cortes mode). */
  clipId?: string;
  /** Jump preview to a moment (seconds in `words` timeline — clip-relative in Cortes). */
  onPreviewAt?: (timeS: number) => void;
};

export default function HighlightPanel({
  jobId,
  words,
  highlightEnabled,
  onHighlightEnabledChange,
  keywords,
  onKeywordsChange,
  clipId,
  onPreviewAt,
}: Props) {
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phrases = useMemo(
    () => (highlightEnabled ? groupHighlightPhrases(words, keywords) : []),
    [words, keywords, highlightEnabled],
  );

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      const r = clipId
        ? await detectClipKeywords(jobId, clipId)
        : await detectKeywords(jobId);
      onKeywordsChange(r.indices);
      if (onPreviewAt && r.indices.length > 0) {
        const first = groupHighlightPhrases(words, r.indices)[0];
        if (first) onPreviewAt(first.start);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao detectar");
    } finally {
      setDetecting(false);
    }
  };

  const toggleWord = (i: number) => {
    const next = keywords.includes(i)
      ? keywords.filter((k) => k !== i)
      : [...keywords, i].sort((a, b) => a - b);
    onKeywordsChange(next);
  };

  const clearAll = async () => {
    onKeywordsChange([]);
    try {
      if (clipId) {
        await saveClipKeywords(jobId, clipId, []);
      } else {
        await saveKeywords(jobId, []);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Destaque dramático" description="Frase grande no centro + vídeo embaçado no momento certo.">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">
            {highlightEnabled ? "Ativo — configure frases abaixo" : "Desligado"}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={highlightEnabled}
            onClick={() => onHighlightEnabledChange(!highlightEnabled)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${
              highlightEnabled ? "bg-accent" : "bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                highlightEnabled ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
      </Section>

      {highlightEnabled && (
        <Section title="Frases de destaque" description="Toque nas palavras ou use IA para detectar" collapsible defaultOpen>
          <div className="mb-3 flex items-center justify-end">
            <button
              onClick={handleDetect}
              disabled={detecting || words.length === 0}
              className="touch-target flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {detecting ? "Detectando..." : "Detectar com IA"}
            </button>
          </div>
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <p className="mb-3 text-xs text-muted">
            Cada destaque mostra 1 ou 2 palavras no tempo exato em que são faladas.
            {keywords.length > 0 && (
              <button onClick={clearAll} className="ml-2 underline hover:text-zinc-200">
                limpar tudo
              </button>
            )}
          </p>

          {phrases.length > 0 && (
            <div className="mb-3 space-y-2">
              {phrases.map((ph, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPreviewAt?.(ph.start)}
                  className="touch-target w-full rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-left text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  &ldquo;{ph.text}&rdquo;
                  <span className="ml-2 text-xs font-normal text-muted">
                    {ph.start.toFixed(1)}s
                    {onPreviewAt && " · ver no vídeo"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-panel/50 p-2">
            {words.map((w, i) => {
              const on = keywords.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => toggleWord(i)}
                  className={`min-h-[36px] rounded-md px-2 py-1 text-sm transition ${
                    on
                      ? "bg-accent font-semibold text-bg"
                      : "text-zinc-400 hover:bg-border/50 hover:text-zinc-100"
                  }`}
                >
                  {w.w}
                </button>
              );
            })}
            {words.length === 0 && (
              <span className="text-sm text-muted">Aguardando transcrição...</span>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
