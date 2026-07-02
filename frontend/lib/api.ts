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
  mode?: "legendas" | "cortes";
  clips_ready?: boolean;
  clip_count?: number;
};

export type ClipSegmentPart = {
  role: "hook" | "body";
  start_word_idx: number;
  end_word_idx: number;
  start_s: number;
  end_s: number;
  duration_s?: number;
};

export type ClipSegment = {
  id: string;
  title: string;
  hook?: string;
  hook_text?: string;
  insight?: string;
  score?: number;
  edit_mode?: "linear" | "hook_then_body";
  segments?: ClipSegmentPart[];
  start_word_idx: number;
  end_word_idx: number;
  start_s: number;
  end_s: number;
  duration_s: number;
  preview?: string;
  enabled: boolean;
  status: "pending" | "rendering" | "done" | "error";
  error?: string;
  headline?: string;
  caption?: string;
};

export type ExportFormatId =
  | "original"
  | "reels_full"
  | "choquei_image"
  | "choquei_video";

export type ComposeSettings = {
  overlay_asset?: string | null;
  headline_text?: string | null;
  headline_style?: string;
  headline_bg?: string;
  headline_color?: string;
  headline_font_size?: number;
  headline_align?: "left" | "center" | "right";
  headline_max_width_pct?: number;
  profile_asset?: string | null;
  instagram_username?: string;
  instagram_caption?: string;
  logo_asset?: string | null;
  logo_x?: number;
  logo_y?: number;
  logo_scale?: number;
  progress_enabled?: boolean;
  progress_color?: string;
  progress_height_pct?: number;
  overlay_pos_x?: number;
  overlay_pos_y?: number;
  video_pos_x?: number;
  video_pos_y?: number;
  ig_bg_color?: string;
  ig_text_color?: string;
  ig_avatar_size?: number;
  ig_username_size?: number;
  ig_caption_size?: number;
};

export type CortesFormatPresets = Partial<Record<ExportFormatId, {
  position: { x: number | null; y: number | null };
  stylePos: { pos_x: number | null; pos_y: number | null };
  compose: ComposeSettings;
  videoPos: { x: number; y: number };
}>>;

export type ClipsData = {
  clips: ClipSegment[];
  manual?: boolean;
  model?: string;
  detecting?: boolean;
  detect_error?: string | null;
  style?: StyleConfig;
  preset?: string;
  words_per_line?: number;
  aspect?: "original" | "vertical";
  template?: string | null;
  resolution?: "480p" | "720p" | "1080p";
  highlight_enabled?: boolean;
  overlay_asset?: string | null;
  profile_asset?: string | null;
  instagram_username?: string;
  logo_asset?: string | null;
  logo_x?: number;
  logo_y?: number;
  logo_scale?: number;
  progress_enabled?: boolean;
  progress_color?: string;
  progress_height_pct?: number;
  headline_style?: string;
  headline_bg?: string;
  headline_color?: string;
  headline_font_size?: number;
  headline_align?: string;
  headline_max_width_pct?: number;
  overlay_pos_x?: number;
  overlay_pos_y?: number;
  video_pos_x?: number;
  video_pos_y?: number;
  ig_bg_color?: string;
  ig_text_color?: string;
  ig_avatar_size?: number;
  ig_username_size?: number;
  ig_caption_size?: number;
  format_presets?: CortesFormatPresets;
};

export type ClipsRenderRequest = {
  clip_ids: string[];
  aspect: "original" | "vertical";
  template?: string | null;
  preset?: string | null;
  custom?: StyleConfig | null;
  words_per_line?: number;
  resolution?: "480p" | "720p" | "1080p";
  highlight_enabled?: boolean;
  overlay_asset?: string | null;
  profile_asset?: string | null;
  instagram_username?: string;
  logo_asset?: string | null;
  logo_x?: number;
  logo_y?: number;
  logo_scale?: number;
  progress_enabled?: boolean;
  progress_color?: string;
  progress_height_pct?: number;
  headline_style?: string;
  headline_bg?: string;
  headline_color?: string;
  headline_font_size?: number;
  headline_align?: string;
  headline_max_width_pct?: number;
  overlay_pos_x?: number;
  overlay_pos_y?: number;
  video_pos_x?: number;
  video_pos_y?: number;
  ig_bg_color?: string;
  ig_text_color?: string;
  ig_avatar_size?: number;
  ig_username_size?: number;
  ig_caption_size?: number;
  format_presets?: CortesFormatPresets;
};

export type ClipsSettings = {
  style?: StyleConfig;
  preset?: string;
  words_per_line?: number;
  aspect?: "original" | "vertical";
  template?: string | null;
  resolution?: "480p" | "720p" | "1080p";
  highlight_enabled?: boolean;
  overlay_asset?: string | null;
  profile_asset?: string | null;
  instagram_username?: string;
  logo_asset?: string | null;
  logo_x?: number;
  logo_y?: number;
  logo_scale?: number;
  progress_enabled?: boolean;
  progress_color?: string;
  progress_height_pct?: number;
  headline_style?: string;
  headline_bg?: string;
  headline_color?: string;
  headline_font_size?: number;
  headline_align?: string;
  headline_max_width_pct?: number;
  overlay_pos_x?: number;
  overlay_pos_y?: number;
  video_pos_x?: number;
  video_pos_y?: number;
  ig_bg_color?: string;
  ig_text_color?: string;
  ig_avatar_size?: number;
  ig_username_size?: number;
  ig_caption_size?: number;
  format_presets?: CortesFormatPresets;
};

export type StyleConfig = {
  font: string;
  font_size: number;
  text_case?: "normal" | "upper" | "lower";
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
  keyword_scale?: number;
  pause_threshold_s?: number;
};

export type PhraseEffect = Record<string, never>;

export type RenderRequest = {
  preset?: string | null;
  custom?: Partial<StyleConfig> | null;
  words_per_line: number;
  pos_x?: number | null;
  pos_y?: number | null;
  // Templates & composition (Fase 4):
  template?: string | null;
  resolution?: "480p" | "720p" | "1080p";
  highlight_enabled?: boolean;
  keywords?: number[] | null;
  highlight_effects?: Record<string, PhraseEffect> | null;
  overlay_asset?: string | null;
  profile_asset?: string | null;
  video_pos_x?: number | null;
  video_pos_y?: number | null;
  headline_text?: string | null;
  headline_style?: string;
  headline_bg?: string;
  headline_color?: string;
  headline_font_size?: number;
  headline_align?: string;
  headline_max_width_pct?: number;
  instagram_username?: string | null;
  instagram_caption?: string | null;
  logo_asset?: string | null;
  logo_x?: number;
  logo_y?: number;
  logo_scale?: number;
  progress_enabled?: boolean;
  progress_color?: string;
  progress_height_pct?: number;
  overlay_pos_x?: number;
  overlay_pos_y?: number;
  ig_bg_color?: string;
  ig_text_color?: string;
  ig_avatar_size?: number;
  ig_username_size?: number;
  ig_caption_size?: number;
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
  subtitle_safe_x?: number | null;
  needs_overlay: boolean;
  overlay_accepts: string[];
  layout?: string;
  header_region?: Region | null;
  left_panel_region?: Region | null;
  right_panel_region?: Region | null;
};

export type ResolutionInfo = { id: string; label: string; short_edge: number };

export type AssetInfo = { filename: string; kind: "image" | "video"; size: number };

export type HighlightPhraseInfo = {
  indices: number[];
  start: number;
  end: number;
  text: string;
};

export type KeywordsResult = {
  indices: number[];
  phrases?: HighlightPhraseInfo[];
  effects?: Record<string, PhraseEffect>;
  words_preview: string[];
  manual: boolean;
  model: string;
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 502) {
      throw new Error(
        "502: O servidor cortou a conexão (upload grande ou timeout). Tente de novo — se persistir, atualize a VPS.",
      );
    }
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadVideo(
  file: File,
  language: string = "auto",
  mode: "legendas" | "cortes" = "legendas",
): Promise<JobState> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  form.append("mode", mode);
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

export async function detectKeywords(jobId: string): Promise<KeywordsResult> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/keywords/detect`, { method: "POST" }),
  );
}

export async function saveKeywords(
  jobId: string,
  indices: number[],
  effects?: Record<string, PhraseEffect> | null,
): Promise<{ indices: number[]; effects?: Record<string, PhraseEffect>; manual: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/keywords`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indices, effects: effects ?? undefined }),
    })
  );
}

export type EnrichResult = {
  ok: boolean;
  changed: number;
  words: Word[];
  punctuation: boolean;
  emojis: boolean;
};

export async function enrichWords(
  jobId: string,
  opts: { punctuation?: boolean; emojis?: boolean },
): Promise<EnrichResult> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        punctuation: opts.punctuation ?? true,
        emojis: opts.emojis ?? false,
      }),
    }),
  );
}

export async function detectClips(jobId: string): Promise<{ ok: boolean; detecting: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/detect`, { method: "POST" }),
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll until clip detection finishes (no new detect POST). */
export async function pollForClips(
  jobId: string,
  opts?: { onProgress?: (msg: string) => void; timeoutMs?: number },
): Promise<ClipsData> {
  const deadline = Date.now() + (opts?.timeoutMs ?? 900_000);
  while (Date.now() < deadline) {
    const r = await getClips(jobId);
    if (r.detect_error) {
      throw new Error(r.detect_error);
    }
    if (!r.detecting) {
      return r;
    }
    opts?.onProgress?.("Detectando cortes com IA (pode levar vários minutos)...");
    await sleep(2500);
  }
  throw new Error("Tempo esgotado — a detecção ainda está rodando. Recarregue em instantes.");
}

/** Start detection and poll until clips are ready (avoids proxy timeout). */
export async function waitForClips(
  jobId: string,
  opts?: { onProgress?: (msg: string) => void; timeoutMs?: number },
): Promise<ClipsData> {
  await detectClips(jobId);
  return pollForClips(jobId, opts);
}

export async function getClips(jobId: string): Promise<ClipsData> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/clips`));
}

export async function saveClips(jobId: string, clips: ClipSegment[]): Promise<ClipsData> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips }),
    }),
  );
}

export async function startClipsRender(
  jobId: string,
  body: ClipsRenderRequest,
): Promise<{ ok: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export function clipOutputUrl(jobId: string, clipId: string): string {
  return `/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/output`;
}

export function sliceWordsForClip(words: Word[], startS: number, endS: number): Word[] {
  return words
    .filter((w) => w.end > startS && w.start < endS)
    .map((w) => ({
      w: w.w,
      start: Math.round(Math.max(0, w.start - startS) * 1000) / 1000,
      end: Math.round(Math.min(endS - startS, w.end - startS) * 1000) / 1000,
    }));
}

export async function saveClipsSettings(
  jobId: string,
  settings: ClipsSettings,
): Promise<ClipsData> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
  );
}

export async function getClipWords(
  jobId: string,
  clipId: string,
): Promise<{ words: Word[]; source: string }> {
  return jsonOrThrow(await fetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/words`));
}

export async function saveClipWords(
  jobId: string,
  clipId: string,
  words: Word[],
): Promise<{ words: Word[]; ok: boolean }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/words`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    }),
  );
}

export async function renderSingleClip(
  jobId: string,
  clipId: string,
  body: Omit<ClipsRenderRequest, "clip_ids">,
): Promise<{ ok: boolean; clip_id: string }> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function getClipKeywords(
  jobId: string,
  clipId: string,
): Promise<KeywordsResult> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/keywords`),
  );
}

export async function detectClipKeywords(
  jobId: string,
  clipId: string,
): Promise<KeywordsResult> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/keywords/detect`, {
      method: "POST",
    }),
  );
}

export async function saveClipKeywords(
  jobId: string,
  clipId: string,
  indices: number[],
): Promise<KeywordsResult> {
  return jsonOrThrow(
    await fetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/keywords`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indices }),
    }),
  );
}

export type HealthStatus = {
  ok: boolean;
  openai_configured: boolean;
  transcribe_engine: string;
  transcribe_ready: boolean;
  ffmpeg_ok: boolean;
};

export type AppSettingsPublic = {
  llm_provider: string;
  openai_api_key_masked: string;
  openai_api_key_set: boolean;
  openai_base_url: string;
  transcribe_engine: string;
  openai_model: string;
  clips_model: string;
  keywords_model: string;
  enrich_model: string;
  allowed_origins: string[];
  public_domain: string;
  configured: boolean;
  transcribe_ready: boolean;
  warnings: string[];
  source: "none" | "env" | "file" | "both";
  platform: string;
  mlx_available: boolean;
};

export type SettingsUpdatePayload = {
  llm_provider?: string;
  openai_api_key?: string;
  openai_base_url?: string;
  transcribe_engine?: string;
  openai_model?: string;
  clips_model?: string;
  keywords_model?: string;
  enrich_model?: string;
  allowed_origins?: string[];
  public_domain?: string;
};

export async function getHealth(): Promise<HealthStatus> {
  return jsonOrThrow(await fetch("/api/health"));
}

export async function getSettings(): Promise<AppSettingsPublic> {
  return jsonOrThrow(await fetch("/api/settings"));
}

export async function updateSettings(payload: SettingsUpdatePayload): Promise<AppSettingsPublic> {
  return jsonOrThrow(
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function testOpenAI(apiKey?: string): Promise<{ ok: boolean; message: string }> {
  return jsonOrThrow(
    await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiKey ? { openai_api_key: apiKey } : {}),
    }),
  );
}
