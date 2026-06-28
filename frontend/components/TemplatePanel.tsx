"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, Loader2, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import {
  assetUrl, deleteAsset, getKeywords, listAssets, saveKeywords, uploadAsset,
  type AssetInfo, type ResolutionInfo, type TemplateInfo, type Word,
} from "@/lib/api";

type Props = {
  jobId: string;
  templates: TemplateInfo[];
  resolutions: ResolutionInfo[];
  selectedTemplate: string | null;
  onTemplateChange: (id: string | null) => void;
  resolution: "480p" | "720p" | "1080p";
  onResolutionChange: (id: "480p" | "720p" | "1080p") => void;
  overlayAsset: string | null;
  onOverlayAssetChange: (filename: string | null) => void;
  keywords: number[];
  onKeywordsChange: (indices: number[]) => void;
  words: Word[];
};

export default function TemplatePanel({
  jobId, templates, resolutions,
  selectedTemplate, onTemplateChange,
  resolution, onResolutionChange,
  overlayAsset, onOverlayAssetChange,
  keywords, onKeywordsChange,
  words,
}: Props) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const r = await listAssets(jobId);
      setAssets(r.assets ?? []);
    } catch { /* ignore */ }
  }, [jobId]);

  useEffect(() => { refreshAssets(); }, [refreshAssets]);

  const tpl = templates.find(t => t.id === selectedTemplate) ?? null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const r = await uploadAsset(jobId, file);
      onOverlayAssetChange(r.filename);
      await refreshAssets();
    } catch (e: any) {
      alert(`Erro ao enviar: ${e?.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAsset = async (filename: string) => {
    if (!confirm("Remover esta mídia?")) return;
    try {
      await deleteAsset(jobId, filename);
      if (overlayAsset === filename) onOverlayAssetChange(null);
      await refreshAssets();
    } catch (e: any) {
      alert(`Erro: ${e?.message ?? e}`);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setKeywordError(null);
    try {
      const r = await getKeywords(jobId);
      onKeywordsChange(r.indices);
    } catch (e: any) {
      setKeywordError(e?.message ?? "Falha ao detectar");
    } finally {
      setDetecting(false);
    }
  };

  const toggleKeyword = (i: number) => {
    if (keywords.includes(i)) {
      onKeywordsChange(keywords.filter(k => k !== i));
    } else {
      onKeywordsChange([...keywords, i].sort((a, b) => a - b));
    }
  };

  const clearKeywords = async () => {
    onKeywordsChange([]);
    try { await saveKeywords(jobId, []); } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Template picker */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Template</h3>
        <div className="grid grid-cols-1 gap-2">
          <TemplateCard
            active={selectedTemplate === null}
            onClick={() => onTemplateChange(null)}
            name="Sem template" desc="Legenda simples no vídeo original" aspect="original" />
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              active={selectedTemplate === t.id}
              onClick={() => onTemplateChange(t.id)}
              name={t.name} desc={t.description} aspect={t.aspect} />
          ))}
        </div>
      </section>

      {tpl && (
        <>
          {/* Midia do template */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Mídia do template ({tpl.aspect})
            </h3>
            <p className="mb-2 text-xs text-zinc-500">
              Envie uma imagem ou vídeo para o espaço de cima.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />

            {!overlayAsset ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-panel px-4 py-6 text-sm text-zinc-400 transition hover:border-accent/50 hover:text-zinc-200 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {uploading ? "Enviando..." : "Clique para enviar imagem/vídeo"}
              </button>
            ) : (
              <div className="rounded-lg border border-border bg-panel p-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 shrink-0 text-accent" />
                  <span className="flex-1 truncate text-sm">{overlayAsset}</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded p-1 text-xs text-zinc-400 hover:text-zinc-100"
                    title="Trocar"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Trocar"}
                  </button>
                  <button
                    onClick={() => handleRemoveAsset(overlayAsset)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {assets.length > 1 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-zinc-500">Outras mídias enviadas:</p>
                {assets.filter(a => a.filename !== overlayAsset).map(a => (
                  <div key={a.filename} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                    <ImageIcon className="h-3 w-3 shrink-0 text-zinc-500" />
                    <button
                      onClick={() => onOverlayAssetChange(a.filename)}
                      className="flex-1 truncate text-left hover:text-accent"
                    >
                      {a.filename}
                    </button>
                    <button
                      onClick={() => handleRemoveAsset(a.filename)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Palavras-chave */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Palavras-chave (zoom)
              </h3>
              <button
                onClick={handleDetect}
                disabled={detecting}
                className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {detecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {detecting ? "Detectando..." : "Detectar com IA"}
              </button>
            </div>
            {keywordError && (
              <p className="mb-2 text-xs text-red-400">{keywordError}</p>
            )}
            <p className="mb-2 text-xs text-zinc-500">
              {keywords.length === 0
                ? "Toque em palavras abaixo para destacá-las com zoom, ou use a IA."
                : `${keywords.length} palavra(s) selecionada(s). Toque pra remover.`}
              {keywords.length > 0 && (
                <button onClick={clearKeywords} className="ml-2 text-zinc-400 underline hover:text-zinc-200">
                  limpar
                </button>
              )}
            </p>
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded border border-border bg-panel/50 p-2">
              {words.map((w, i) => {
                const on = keywords.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleKeyword(i)}
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

          {/* Resolução */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Resolução</h3>
            <div className="grid grid-cols-3 gap-2">
              {resolutions.map(r => {
                const id = r.id as "480p" | "720p" | "1080p";
                return (
                <button
                  key={r.id}
                  onClick={() => onResolutionChange(id)}
                  className={`rounded-md border px-3 py-2 text-sm transition ${
                    resolution === r.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {r.label}
                </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TemplateCard({
  active, onClick, name, desc, aspect,
}: {
  active: boolean; onClick: () => void; name: string; desc: string; aspect: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
        active ? "border-accent bg-accent/10" : "border-border bg-panel hover:border-zinc-500"
      }`}
    >
      <AspectIcon aspect={aspect} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${active ? "text-accent" : "text-zinc-200"}`}>{name}</div>
        <div className="truncate text-xs text-zinc-500">{desc}</div>
      </div>
    </button>
  );
}

function AspectIcon({ aspect }: { aspect: string }) {
  // tiny visual of the aspect ratio
  let w = 18, h = 18;
  if (aspect === "9:16") { w = 11; h = 20; }
  else if (aspect === "1:1") { w = 18; h = 18; }
  else if (aspect === "16:9") { w = 22; h = 12; }
  return (
    <div
      className="shrink-0 rounded-sm border-2"
      style={{
        width: w, height: h,
        borderColor: aspect === "original" ? "#52525b" : "#FACC15",
      }}
    />
  );
}
