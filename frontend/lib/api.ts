export type Word = { w: string; start: number; end: number };

export type WordsData = {
  duration: number;
  fps: number;
  width: number;
  height: number;
  words: Word[];
};

export type JobState = {
  id: string;
  stage: string;
  progress: number;
  message: string;
  filename: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  has_words: boolean;
  has_output: boolean;
};

export type StyleConfig = {
  font: string;
  font_size: number;
  primary_color: string;
  secondary_color: string;
  outline_color: string;
  outline_width: number;
  shadow: number;
  bold: boolean;
  italic: boolean;
  animation: "pop" | "fade" | "none";
  pop_scale: number;
  pop_duration_ms: number;
  box: boolean;
  box_color: string;
  box_opacity: number;
  pos_x: number | null;
  pos_y: number | null;
  margin_v: number;
  letter_spacing?: number;
  word_spacing?: number;
};

export type RenderRequest = {
  preset?: string | null;
  custom?: Partial<StyleConfig> | null;
  words_per_line: number;
  pos_x?: number | null;
  pos_y?: number | null;
  // Templates & composition (Fase 4):
  template?: string | null;
  resolution?: "480p" | "720p" | "1080p";
  keywords?: number[] | null;
  overlay_asset?: string | null;
};

export type Region = { x: number; y: number; w: number; h: number };

export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  aspect: string;
  width: number;
  height: number;
  overlay_region: Region;
  video_region: Region;
  subtitle_safe_y: number;
  needs_overlay: boolean;
  overlay_accepts: string[];
};

export type ResolutionInfo = { id: string; label: string; short_edge: number };

export type AssetInfo = { filename: string; kind: "image" | "video"; size: number };

export type KeywordsResult = {
  indices: number[];
  words_preview: string[];
  manual: boolean;
  model: string;
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadVideo(file: File, language: string = "auto"): Promise<JobState> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  const res = await fetch("/api/jobs", { method: "POST", body: form });
  return jsonOrThrow<JobState>(res);
}

export async function getJob(jobId: string): Promise<JobState> {
  return jsonOrThrow<JobState>(await fetch(`/api/jobs/${jobId}`));
}

export async function deleteJob(jobId: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}`, { method: "DELETE" }));
}

export async function startTranscribe(jobId: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/transcribe`, { method: "POST" }));
}

export async function getWords(jobId: string): Promise<WordsData> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/words`));
}

export async function saveWords(jobId: string, words: Word[]): Promise<{ ok: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/words`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    })
  );
}

export async function startRender(jobId: string, body: RenderRequest): Promise<{ ok: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export function videoUrl(jobId: string): string {
  return `/api/jobs/${jobId}/video`;
}

export function outputUrl(jobId: string): string {
  return `/api/jobs/${jobId}/output.mp4`;
}

export function eventsUrl(jobId: string): string {
  if (typeof window !== "undefined") {
    return `/api/jobs/${jobId}/events`;
  }
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  return `${base}/api/jobs/${jobId}/events`;
}

export async function listPresets(): Promise<{ presets: { id: string; name: string; values: any }[] }> {
  return jsonOrThrow(await fetch(`/api/presets`));
}

export async function listTemplates(): Promise<{ templates: TemplateInfo[]; resolutions: ResolutionInfo[] }> {
  return jsonOrThrow(await fetch(`/api/templates`));
}

export async function listAssets(jobId: string): Promise<{ assets: AssetInfo[] }> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/assets`));
}

export async function uploadAsset(jobId: string, file: File): Promise<{ filename: string; kind: string; size: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/jobs/${jobId}/assets`, { method: "POST", body: form });
  return jsonOrThrow(res);
}

export async function deleteAsset(jobId: string, filename: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/assets/${encodeURIComponent(filename)}`, { method: "DELETE" }));
}

export function assetUrl(jobId: string, filename: string): string {
  return `/api/jobs/${jobId}/assets/${encodeURIComponent(filename)}`;
}

export async function getKeywords(jobId: string): Promise<KeywordsResult> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/keywords`));
}

export async function saveKeywords(jobId: string, indices: number[]): Promise<{ indices: number[]; manual: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/keywords`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indices }),
    })
  );
}
