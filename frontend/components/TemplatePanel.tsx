"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, Loader2, Trash2, Upload, X,
} from "lucide-react";
import {
  assetUrl, deleteAsset, listAssets, uploadAsset,
  type AssetInfo, type ComposeSettings, type ResolutionInfo, type TemplateInfo,
} from "@/lib/api";
import ComposeStyleControls from "@/components/ComposeStyleControls";

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
  compose: ComposeSettings;
  onComposeChange: (patch: Partial<ComposeSettings>) => void;
};

export default function TemplatePanel({
  jobId, templates, resolutions,
  selectedTemplate, onTemplateChange,
  resolution, onResolutionChange,
  overlayAsset, onOverlayAssetChange,
  compose, onComposeChange,
}: Props) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const r = await listAssets(jobId);
      setAssets(r.assets ?? []);
    } catch { /* ignore */ }
  }, [jobId]);

  useEffect(() => { refreshAssets(); }, [refreshAssets]);

  const tpl = templates.find(t => t.id === selectedTemplate) ?? null;
  const isChoquei = tpl?.id.startsWith("choquei_");

  const handleUpload = async (file: File, target: "overlay" | "logo") => {
    setUploading(target);
    try {
      const r = await uploadAsset(jobId, file);
      if (target === "overlay") onOverlayAssetChange(r.filename);
      else onComposeChange({ logo_asset: r.filename });
      await refreshAssets();
    } catch (e: unknown) {
      alert(`Erro ao enviar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveAsset = async (filename: string) => {
    if (!confirm("Remover esta mídia?")) return;
    try {
      await deleteAsset(jobId, filename);
      if (overlayAsset === filename) onOverlayAssetChange(null);
      if (compose.logo_asset === filename) onComposeChange({ logo_asset: null });
      await refreshAssets();
    } catch (e: unknown) {
      alert(`Erro: ${e instanceof Error ? e.message : e}`);
    }
  };

  const overlayAccept = tpl?.overlay_accepts?.includes("video") && tpl?.overlay_accepts?.includes("image")
    ? "image/*,video/*"
    : tpl?.overlay_accepts?.includes("video") ? "video/*" : "image/*";

  return (
    <div className="flex flex-col gap-5 p-4">
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
          {tpl.needs_overlay && (
            <UploadSection
              title="Mídia do template"
              hint="Imagem ou vídeo no espaço de cima."
              filename={overlayAsset}
              uploading={uploading === "overlay"}
              onUpload={() => fileInputRef.current?.click()}
              onRemove={() => overlayAsset && handleRemoveAsset(overlayAsset)}
            />
          )}

          {isChoquei && (
            <>
              <Field label="Headline (divisão)">
                <input
                  value={compose.headline_text ?? ""}
                  onChange={(e) => onComposeChange({ headline_text: e.target.value })}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm uppercase"
                  placeholder="INVESTIMENTO PARA CURSOS..."
                />
              </Field>
              <Field label="Estilo">
                <select
                  value={compose.headline_style ?? "bold_red"}
                  onChange={(e) => onComposeChange({ headline_style: e.target.value })}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                >
                  <option value="bold_red">Vermelho bold</option>
                  <option value="simple">Caixa simples</option>
                </select>
              </Field>
            </>
          )}

          <UploadSection
            title="Logo (opcional)"
            hint="Marca d'água — arraste no preview."
            filename={compose.logo_asset}
            uploading={uploading === "logo"}
            onUpload={() => logoRef.current?.click()}
            onRemove={() => compose.logo_asset && handleRemoveAsset(compose.logo_asset)}
          />

          {compose.logo_asset && (
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <label>X %<input type="range" min={0} max={100} value={Math.round((compose.logo_x ?? 0.85) * 100)}
                onChange={(e) => onComposeChange({ logo_x: Number(e.target.value) / 100 })} className="w-full" /></label>
              <label>Y %<input type="range" min={0} max={100} value={Math.round((compose.logo_y ?? 0.78) * 100)}
                onChange={(e) => onComposeChange({ logo_y: Number(e.target.value) / 100 })} className="w-full" /></label>
              <label className="col-span-2">Tamanho<input type="range" min={8} max={40}
                value={Math.round((compose.logo_scale ?? 0.18) * 100)}
                onChange={(e) => onComposeChange({ logo_scale: Number(e.target.value) / 100 })} className="w-full" /></label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={compose.progress_enabled ?? false}
              onChange={(e) => onComposeChange({ progress_enabled: e.target.checked })}
              className="rounded border-border" />
            Barra de progresso fake
          </label>

          <ComposeStyleControls
            compose={compose}
            onChange={onComposeChange}
            showHeadline={isChoquei}
            showProgress
            showOverlayCrop={Boolean(tpl?.needs_overlay)}
          />

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Resolução</h3>
            <div className="grid grid-cols-3 gap-2">
              {resolutions.map(r => {
                const id = r.id as "480p" | "720p" | "1080p";
                return (
                  <button key={r.id} onClick={() => onResolutionChange(id)}
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      resolution === r.id ? "border-accent bg-accent/10 text-accent" : "border-border text-zinc-400 hover:border-zinc-500"
                    }`}>{r.label}</button>
                );
              })}
            </div>
          </section>
        </>
      )}

      <input ref={fileInputRef} type="file" accept={overlayAccept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "overlay"); e.target.value = ""; }} />
      <input ref={logoRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "logo"); e.target.value = ""; }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</h3>
      {children}
    </section>
  );
}

function UploadSection({ title, hint, filename, uploading, onUpload, onRemove }: {
  title: string; hint: string; filename?: string | null; uploading: boolean;
  onUpload: () => void; onRemove: () => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <p className="mb-2 text-xs text-zinc-500">{hint}</p>
      {!filename ? (
        <button onClick={onUpload} disabled={uploading}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-panel px-4 py-6 text-sm text-zinc-400 transition hover:border-accent/50 hover:text-zinc-200 disabled:opacity-50">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {uploading ? "Enviando..." : "Clique para enviar"}
        </button>
      ) : (
        <div className="rounded-lg border border-border bg-panel p-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 shrink-0 text-accent" />
            <span className="flex-1 truncate text-sm">{filename}</span>
            <button onClick={onUpload} disabled={uploading} className="rounded p-1 text-xs text-zinc-400 hover:text-zinc-100">Trocar</button>
            <button onClick={onRemove} className="rounded p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
    </section>
  );
}

function TemplateCard({
  active, onClick, name, desc, aspect,
}: {
  active: boolean; onClick: () => void; name: string; desc: string; aspect: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
        active ? "border-accent bg-accent/10" : "border-border bg-panel hover:border-zinc-500"
      }`}>
      <AspectIcon aspect={aspect} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${active ? "text-accent" : "text-zinc-200"}`}>{name}</div>
        <div className="truncate text-xs text-zinc-500">{desc}</div>
      </div>
    </button>
  );
}

function AspectIcon({ aspect }: { aspect: string }) {
  let w = 18, h = 18;
  if (aspect === "9:16") { w = 11; h = 20; }
  else if (aspect === "1:1") { w = 18; h = 18; }
  else if (aspect === "16:9") { w = 22; h = 12; }
  return (
    <div className="shrink-0 rounded-sm border-2"
      style={{ width: w, height: h, borderColor: aspect === "original" ? "#52525b" : "#FACC15" }} />
  );
}
