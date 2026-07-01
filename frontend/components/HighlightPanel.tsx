"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { detectKeywords, saveKeywords, detectClipKeywords, saveClipKeywords, type Word } from "@/lib/api";
import { groupHighlightPhrases } from "@/lib/highlightPhrases";

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
      <section className="rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Destaque dramático</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Frase grande no centro + vídeo embaçado no momento certo.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={highlightEnabled}
            onClick={() => onHighlightEnabledChange(!highlightEnabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              highlightEnabled ? "bg-accent" : "bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                highlightEnabled ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {highlightEnabled && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Frases de destaque
            </h3>
            <button
              onClick={handleDetect}
              disabled={detecting || words.length === 0}
              className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {detecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {detecting ? "Detectando..." : "Detectar com IA"}
            </button>
          </div>
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <p className="mb-2 text-xs text-zinc-500">
            Toque nas palavras — cada destaque mostra 1 ou 2 palavras no tempo exato em que são faladas.
            {keywords.length > 0 && (
              <button onClick={clearAll} className="ml-2 underline hover:text-zinc-200">
                limpar
              </button>
            )}
          </p>

          {phrases.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {phrases.map((ph, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPreviewAt?.(ph.start)}
                  className="w-full rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-left text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  &ldquo;{ph.text}&rdquo;
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {ph.start.toFixed(1)}s
                    {onPreviewAt && " · ver no vídeo"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded border border-border bg-panel/50 p-2">
            {words.map((w, i) => {
              const on = keywords.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => toggleWord(i)}
                  className={`rounded px-1.5 py-0.5 text-xs transition ${
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
              <span className="text-xs text-zinc-500">Aguardando transcrição...</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
