"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Save, Search, Sparkles, Smile } from "lucide-react";
import { enrichWords, saveWords, type Word } from "@/lib/api";
import { isWordActive } from "@/lib/subtitleLayout";
import { stripEmojis } from "@/lib/textFormat";

const QUICK_PUNCT = [",", ".", "!", "?", "…", ":", ";", "—"] as const;

const QUICK_EMOJIS = [
  "🔥", "✨", "💰", "🚀", "💪", "❤️", "👀", "⚡",
  "🎯", "✅", "👇", "💡", "🎬", "📈", "🙌", "😱",
] as const;

type Props = {
  jobId: string;
  words: Word[];
  onChange: (words: Word[]) => void;
  onSave: () => Promise<void>;
  onSeek: (time: number) => void;
  currentTime: number;
  disableEnrich?: boolean;
};

export default function TranscriptEditor({
  jobId, words, onChange, onSave, onSeek, currentTime, disableEnrich = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [enriching, setEnriching] = useState<"punct" | "emoji" | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const filteredIdx = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.w.toLowerCase().includes(q))
      .map(({ i }) => i);
  }, [query, words]);

  const visibleIndices = filteredIdx ?? words.map((_, i) => i);

  const updateWord = (i: number, text: string) => {
    const next = words.slice();
    next[i] = { ...next[i], w: text };
    onChange(next);
    setSaved(false);
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditText(words[i].w.trim());
    onSeek(words[i].start);
  };

  const commitEdit = () => {
    if (editingIdx !== null) {
      updateWord(editingIdx, editText.trim() || words[editingIdx].w);
      setEditingIdx(null);
    }
  };

  const liveEdit = (i: number, text: string) => {
    setEditText(text);
    const next = words.slice();
    next[i] = { ...next[i], w: text };
    onChange(next);
    setSaved(false);
  };

  const appendToEdit = (suffix: string) => {
    setEditText((t) => {
      if (QUICK_PUNCT.includes(suffix as (typeof QUICK_PUNCT)[number])) {
        return t.replace(/[,.\!?…:;—]+$/, "") + suffix;
      }
      if ((QUICK_EMOJIS as readonly string[]).includes(suffix)) {
        return t.includes(suffix) ? t : `${suffix} ${t}`.trim();
      }
      return t + suffix;
    });
  };

  const handleEnrich = async (kind: "punct" | "emoji") => {
    setEnriching(kind);
    setEnrichError(null);
    try {
      const r = await enrichWords(jobId, {
        punctuation: kind === "punct",
        emojis: kind === "emoji",
      });
      onChange(r.words);
      setSaved(false);
      if (r.changed === 0 && kind === "punct") {
        setEnrichError("Nenhuma vírgula ou ponto foi adicionada — tente de novo.");
      } else if (r.changed > 0) {
        setEnrichError(null);
      }
    } catch (e: unknown) {
      setEnrichError(e instanceof Error ? e.message : "Falha ao enriquecer");
    } finally {
      setEnriching(null);
    }
  };

  const handleRemoveEmojis = async () => {
    const next = words.map((w) => ({ ...w, w: stripEmojis(w.w) || w.w }));
    onChange(next);
    setEnrichError(null);
    try {
      await saveWords(jobId, next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setEnrichError(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const handleSave = async () => {
    await onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar palavra..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <span className="shrink-0 text-xs text-zinc-500">{visibleIndices.length}</span>
          </div>
          <button
            onClick={handleSave}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
              saved ? "bg-green-500/20 text-green-300" : "bg-accent text-bg"
            }`}
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!disableEnrich && (
            <>
              <button
                onClick={() => handleEnrich("punct")}
                disabled={enriching !== null}
                className="flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-xs text-zinc-300 hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {enriching === "punct" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Pontuação IA
              </button>
              <button
                onClick={() => handleEnrich("emoji")}
                disabled={enriching !== null}
                className="flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-xs text-zinc-300 hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {enriching === "emoji" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smile className="h-3 w-3" />}
                Emojis IA
              </button>
              <button
                onClick={handleRemoveEmojis}
                disabled={enriching !== null}
                className="flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-xs text-zinc-300 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
              >
                Remover emojis
              </button>
            </>
          )}
        </div>
        {enrichError && <p className="text-xs text-red-400">{enrichError}</p>}
      </div>

      {editingIdx !== null && (
        <div className="border-b border-border bg-panel/80 p-3">
          <p className="mb-2 text-xs text-zinc-500">Editando — pontuação e emojis:</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {QUICK_PUNCT.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => appendToEdit(p)}
                className="min-w-[28px] rounded border border-border bg-bg px-2 py-0.5 text-sm hover:border-accent/50"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => appendToEdit(e)}
                className="rounded border border-border bg-bg px-1.5 py-0.5 text-base hover:border-accent/50"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5">
          {visibleIndices.map((i) => {
            const w = words[i];
            const isActive = isWordActive(w, currentTime);
            const isEditing = editingIdx === i;
            return (
              <span key={i} className="inline-flex items-center">
                <button
                  onClick={() => onSeek(w.start)}
                  onDoubleClick={() => startEdit(i)}
                  className={`rounded px-1.5 py-0.5 text-sm transition ${
                    isActive
                      ? "bg-accent/20 text-accent"
                      : "text-zinc-300 hover:bg-panel"
                  } ${isEditing ? "ring-1 ring-accent" : ""}`}
                  title={`${w.start.toFixed(2)}s — duplo clique para editar`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => liveEdit(i, e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingIdx(null);
                      }}
                      className="min-w-[48px] bg-bg px-1 outline-none ring-1 ring-accent"
                      style={{ width: `${Math.max(56, editText.length * 9)}px` }}
                    />
                  ) : (
                    w.w.trim() || "·"
                  )}
                </button>
              </span>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Clique para ir ao tempo · duplo clique para editar (vírgulas, !, emojis) ·
          pontuação já vem automática após transcrever · use Emojis IA para destacar palavras-chave.
        </p>
      </div>
    </div>
  );
}
