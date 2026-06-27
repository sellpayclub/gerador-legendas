"use client";

import { useMemo, useState } from "react";
import { Search, Save, Check } from "lucide-react";
import type { Word } from "@/lib/api";

type Props = {
  words: Word[];
  onChange: (words: Word[]) => void;
  onSave: () => Promise<void>;
  onSeek: (time: number) => void;
  currentTime: number;
};

export default function TranscriptEditor({ words, onChange, onSave, onSeek, currentTime }: Props) {
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

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
    // Preserve leading space convention
    if (next[i].w.startsWith(" ") && !text.startsWith(" ")) {
      text = " " + text;
    }
    next[i] = { ...next[i], w: text };
    onChange(next);
    setSaved(false);
  };

  const handleSave = async () => {
    await onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar palavra..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <span className="text-xs text-zinc-500">{visibleIndices.length} palavras</span>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            saved ? "bg-green-500/20 text-green-300" : "bg-accent text-bg"
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Salvo" : "Salvar"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5">
          {visibleIndices.map((i) => {
            const w = words[i];
            const isActive = currentTime >= w.start - 0.01 && currentTime < w.end;
            const isEditing = editingIdx === i;
            return (
              <span key={i} className="inline-flex items-center">
                <button
                  onClick={() => onSeek(w.start)}
                  onDoubleClick={() => setEditingIdx(i)}
                  className={`rounded px-1.5 py-0.5 text-sm transition ${
                    isActive
                      ? "bg-accent/20 text-accent"
                      : "text-zinc-300 hover:bg-panel"
                  } ${isEditing ? "ring-1 ring-accent" : ""}`}
                  title={`${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s — duplo clique para editar`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={w.w.trim()}
                      onChange={(e) => updateWord(i, e.target.value)}
                      onBlur={() => setEditingIdx(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditingIdx(null);
                      }}
                      className="bg-bg px-1 outline-none ring-1 ring-accent"
                      style={{ width: `${Math.max(40, w.w.length * 8)}px` }}
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
          Dica: clique para o vídeo pular até a palavra · duplo clique para editar · "Salvar" grava as correções no servidor.
        </p>
      </div>
    </div>
  );
}
