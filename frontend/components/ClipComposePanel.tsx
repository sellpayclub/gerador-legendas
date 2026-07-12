"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import {
  assetUrl, deleteAsset, listAssets, uploadAsset,
  type AssetInfo, type ComposeSettings, type ExportFormatId,
} from "@/lib/api";
import { needsOverlay, overlayAccepts } from "@/components/ClipFormatPicker";
import ComposeStyleControls from "@/components/ComposeStyleControls";

type Props = {
  jobId: string;
  format: ExportFormatId;
  compose: ComposeSettings;
  onComposeChange: (patch: Partial<ComposeSettings>) => void;
  /** Per-clip headline text */
  clipText?: string;
  onClipTextChange?: (text: string) => void;
  clipTextLabel?: string;
};

export default function ClipComposePanel({
  jobId, format, compose, onComposeChange,
  clipText, onClipTextChange, clipTextLabel,
}: Props) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const overlayRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const r = await listAssets(jobId);
      setAssets(r.assets ?? []);
    } catch { /* ignore */ }
  }, [jobId]);

  useEffect(() => { refreshAssets(); }, [refreshAssets]);

  const handleUpload = async (file: File, field: "overlay_asset" | "logo_asset") => {
    setUploading(field);
    try {
      const r = await uploadAsset(jobId, file);
      onComposeChange({ [field]: r.filename });
      await refreshAssets();
    } catch (e: unknown) {
      alert(`Erro ao enviar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUploading(null);
    }
  };

  const acceptOverlay = overlayAccepts(format);
  const acceptStr = acceptOverlay.includes("video") && acceptOverlay.includes("image")
    ? "image/*,video/*"
    : acceptOverlay.includes("video")
      ? "video/*"
      : "image/*";

  const isChoquei = format === "choquei_image" || format === "choquei_video";

  return (
    <div className="space-y-4 px-4 py-3">
      {needsOverlay(format) && (
        <AssetBlock
          label="Mídia do topo"
          filename={compose.overlay_asset}
          uploading={uploading === "overlay_asset"}
          onPick={() => overlayRef.current?.click()}
          onClear={() => onComposeChange({ overlay_asset: null })}
          assets={assets}
          current={compose.overlay_asset}
          onSelect={(f) => onComposeChange({ overlay_asset: f })}
          onDelete={async (f) => {
            await deleteAsset(jobId, f);
            if (compose.overlay_asset === f) onComposeChange({ overlay_asset: null });
            refreshAssets();
          }}
        />
      )}

      {isChoquei && onClipTextChange && (
        <>
          <Field label={clipTextLabel ?? "Headline do corte"}>
            <textarea
              value={clipText ?? ""}
              onChange={(e) => onClipTextChange(e.target.value)}
              rows={3}
              placeholder="Digite o título — Enter para quebrar linha"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm leading-snug"
            />
          </Field>
          <Field label="Estilo headline">
            <select
              value={compose.headline_style ?? "bold_red"}
              onChange={(e) => onComposeChange({ headline_style: e.target.value })}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              <option value="bold_red">Vermelho bold (Choquei)</option>
              <option value="simple">{t("template.styleSimple")}</option>
            </select>
          </Field>
        </>
      )}

      <AssetBlock
        label="Logo / marca d'água (opcional)"
        filename={compose.logo_asset}
        uploading={uploading === "logo_asset"}
        onPick={() => logoRef.current?.click()}
        onClear={() => onComposeChange({ logo_asset: null })}
        assets={assets.filter((a) => a.kind === "image")}
        current={compose.logo_asset}
        onSelect={(f) => onComposeChange({ logo_asset: f })}
        onDelete={async (f) => {
          await deleteAsset(jobId, f);
          if (compose.logo_asset === f) onComposeChange({ logo_asset: null });
          refreshAssets();
        }}
      />

      {(compose.logo_asset) && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Logo X (%)">
            <input type="range" min={0} max={100} value={Math.round((compose.logo_x ?? 0.85) * 100)}
              onChange={(e) => onComposeChange({ logo_x: Number(e.target.value) / 100 })}
              className="w-full" />
          </Field>
          <Field label="Logo Y (%)">
            <input type="range" min={0} max={100} value={Math.round((compose.logo_y ?? 0.78) * 100)}
              onChange={(e) => onComposeChange({ logo_y: Number(e.target.value) / 100 })}
              className="w-full" />
          </Field>
          <Field label="Tamanho logo">
            <input type="range" min={8} max={40} value={Math.round((compose.logo_scale ?? 0.18) * 100)}
              onChange={(e) => onComposeChange({ logo_scale: Number(e.target.value) / 100 })}
              className="w-full" />
          </Field>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={compose.progress_enabled ?? false}
          onChange={(e) => onComposeChange({ progress_enabled: e.target.checked })}
          className="rounded border-border"
        />
        Barra de progresso fake
      </label>

      <ComposeStyleControls
        compose={compose}
        onChange={onComposeChange}
        showHeadline={isChoquei}
        showProgress
        showOverlayCrop={needsOverlay(format)}
      />

      <input ref={overlayRef} type="file" accept={acceptStr} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "overlay_asset"); e.target.value = ""; }} />
      <input ref={logoRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "logo_asset"); e.target.value = ""; }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function AssetBlock({
  label, filename, uploading, onPick, onClear, assets, current, onSelect, onDelete,
}: {
  label: string; filename?: string | null; uploading: boolean; onPick: () => void; onClear: () => void;
  assets: AssetInfo[]; current?: string | null;
  onSelect: (f: string) => void; onDelete: (f: string) => void;
}) {
  return (
    <Field label={label}>
      {!filename ? (
        <button type="button" onClick={onPick} disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-xs text-zinc-400 hover:border-accent/50">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar arquivo
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-2 text-xs">
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="flex-1 truncate">{filename}</span>
          <button type="button" onClick={onPick} className="text-zinc-400 hover:text-zinc-100">{t("template.change")}</button>
          <button type="button" onClick={onClear} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </Field>
  );
}
