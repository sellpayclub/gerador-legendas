export type Word = { w: string; start: number; end: number };

export type SalesClient = {
  name: string;
  email: string;
  whatsapp: string;
  purchases_count: number;
  total_cents: number;
  last_paid_at: string | null;
};

export type SalesDashboard = {
  generated_at: string;
  total_sales_count: number;
  total_revenue_cents: number;
  month_sales_count: number;
  month_revenue_cents: number;
  year_revenue_cents: number;
  annualized_revenue_cents: number;
  customers_count: number;
  clients: SalesClient[];
  monthly_series: { label: string; revenue_cents: number; sales_count: number }[];
};

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
  created_at?: number;
  updated_at?: number;
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
  overlay_asset?: string | null;
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

export type ClipFocusType = "viral" | "polemico" | "engracado" | "valioso" | "inspirador" | "choque";

export type ClipsData = {
  clips: ClipSegment[];
  manual?: boolean;
  model?: string;
  detecting?: boolean;
  detect_error?: string | null;
  detect_focuses?: ClipFocusType[];
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
  animation: "pop" | "fade" | "bounce" | "slide" | "none";
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

async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const { getAccessToken } = await import("@/lib/supabase/client");
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const auth = await authHeaders();
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(auth)) {
    headers.set(k, v);
  }
  const res = await fetch(input, { ...init, headers });
  if (typeof window !== "undefined") {
    if (res.status === 402) {
      window.location.href = "/plano-inativo";
    } else if (res.status === 403) {
      const payload = await res.clone().json().catch(() => null);
      const code = payload?.detail?.code;
      const { isMultiTenant } = await import("@/lib/hosted");
      if (isMultiTenant() && code === "openai_key_missing") {
        window.location.href = "/configuracoes";
      }
    }
  }
  return res;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 413) {
      throw new Error(
        "413: Arquivo grande demais para o servidor. Se persistir após atualizar a VPS, avise o suporte.",
      );
    }
    if (res.status === 502) {
      throw new Error(
        "502: O servidor cortou a conexão (upload grande ou timeout). Tente de novo — se persistir, atualize a VPS.",
      );
    }
    try {
      const payload = JSON.parse(text);
      const detail = payload?.detail;
      const message = typeof detail === "string" ? detail : detail?.message;
      if (message) throw new Error(`${res.status}: ${message}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${res.status}:`)) {
        throw error;
      }
    }
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadVideo(
  file: File,
  language: string = "auto",
  mode: "legendas" | "cortes" = "legendas",
  onProgress?: (pct: number) => void,
): Promise<JobState> {
  const { getAccessToken } = await import("@/lib/supabase/client");
  const { isMultiTenant } = await import("@/lib/hosted");
  const hosted = isMultiTenant();
  const token = hosted ? await getAccessToken(true) : null;
  if (hosted && !token) {
    throw new Error("401: Sessão expirada. Faça login novamente e tente outra vez.");
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("language", language);
    form.append("mode", mode);

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 402) {
        window.location.href = "/plano-inativo";
        reject(new Error("402: Plano inativo."));
        return;
      }
      if (xhr.status === 403) {
        window.location.href = "/configuracoes";
        reject(new Error("403: Configure sua chave OpenAI."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as JobState);
        } catch {
          reject(new Error("Resposta inválida do servidor após upload."));
        }
        return;
      }
      const text = xhr.responseText?.slice(0, 200) || xhr.statusText;
      if (xhr.status === 413) {
        reject(new Error("413: Arquivo grande demais para o servidor."));
        return;
      }
      if (xhr.status === 502) {
        reject(new Error("502: O servidor cortou a conexão (upload grande ou timeout)."));
        return;
      }
      reject(new Error(`${xhr.status}: ${text}`));
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Erro de rede durante o upload. Verifique sua conexão."));
    });
    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelado."));
    });

    xhr.open("POST", "/api/jobs");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  });
}

export async function getJob(jobId: string): Promise<JobState> {
  return jsonOrThrow<JobState>(await apiFetch(`/api/jobs/${jobId}`));
}

export async function listJobs(): Promise<{ jobs: JobState[] }> {
  return jsonOrThrow(await apiFetch("/api/jobs"));
}

export async function deleteJob(jobId: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}`, { method: "DELETE" }));
}

export async function startTranscribe(jobId: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/transcribe`, { method: "POST" }));
}

export async function getWords(jobId: string): Promise<WordsData> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/words`));
}

export async function saveWords(jobId: string, words: Word[]): Promise<{ ok: boolean }> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/words`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    })
  );
}

export async function startRender(jobId: string, body: RenderRequest): Promise<{ ok: boolean }> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export function videoUrl(jobId: string, accessToken?: string | null): string {
  const base = `/api/jobs/${jobId}/video`;
  if (accessToken) {
    return `${base}?access_token=${encodeURIComponent(accessToken)}`;
  }
  return base;
}

export function outputUrl(jobId: string, accessToken?: string | null): string {
  const base = `/api/jobs/${jobId}/output.mp4`;
  if (accessToken) {
    return `${base}?access_token=${encodeURIComponent(accessToken)}`;
  }
  return base;
}

export function eventsUrl(jobId: string, accessToken?: string | null): string {
  const base =
    typeof window !== "undefined"
      ? `/api/jobs/${jobId}/events`
      : `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"}/api/jobs/${jobId}/events`;
  if (accessToken) {
    return `${base}?access_token=${encodeURIComponent(accessToken)}`;
  }
  return base;
}

export async function listPresets(): Promise<{ presets: { id: string; name: string; values: any }[] }> {
  return jsonOrThrow(await apiFetch(`/api/presets`));
}

export async function listTemplates(): Promise<{ templates: TemplateInfo[]; resolutions: ResolutionInfo[] }> {
  return jsonOrThrow(await apiFetch(`/api/templates`));
}

export async function listAssets(jobId: string): Promise<{ assets: AssetInfo[] }> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/assets`));
}

export async function uploadAsset(jobId: string, file: File): Promise<{ filename: string; kind: string; size: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/api/jobs/${jobId}/assets`, { method: "POST", body: form });
  return jsonOrThrow(res);
}

export async function deleteAsset(jobId: string, filename: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/assets/${encodeURIComponent(filename)}`, { method: "DELETE" }));
}

export function assetUrl(jobId: string, filename: string, accessToken?: string | null): string {
  const base = `/api/jobs/${jobId}/assets/${encodeURIComponent(filename)}`;
  if (accessToken) {
    return `${base}?access_token=${encodeURIComponent(accessToken)}`;
  }
  return base;
}

export async function getKeywords(jobId: string): Promise<KeywordsResult> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/keywords`));
}

export async function detectKeywords(jobId: string): Promise<KeywordsResult> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/keywords/detect`, { method: "POST" }),
  );
}

export async function saveKeywords(
  jobId: string,
  indices: number[],
  effects?: Record<string, PhraseEffect> | null,
): Promise<{ indices: number[]; effects?: Record<string, PhraseEffect>; manual: boolean }> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/keywords`, {
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
    await apiFetch(`/api/jobs/${jobId}/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        punctuation: opts.punctuation ?? true,
        emojis: opts.emojis ?? false,
      }),
    }),
  );
}

export async function detectClips(
  jobId: string,
  focuses: ClipFocusType[] = [],
): Promise<{ ok: boolean; detecting: boolean }> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/clips/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focuses }),
    }),
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
  opts?: { onProgress?: (msg: string) => void; timeoutMs?: number; focuses?: ClipFocusType[] },
): Promise<ClipsData> {
  await detectClips(jobId, opts?.focuses ?? []);
  return pollForClips(jobId, opts);
}

export async function getClips(jobId: string): Promise<ClipsData> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/clips`));
}

export async function saveClips(jobId: string, clips: ClipSegment[]): Promise<ClipsData> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/clips`, {
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
    await apiFetch(`/api/jobs/${jobId}/clips/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export function clipOutputUrl(jobId: string, clipId: string, accessToken?: string | null): string {
  const base = `/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/output`;
  if (accessToken) {
    return `${base}?access_token=${encodeURIComponent(accessToken)}`;
  }
  return base;
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
    await apiFetch(`/api/jobs/${jobId}/clips/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
  );
}

export async function syncClipsEditing(
  jobId: string,
  sourceClipId: string,
): Promise<{ ok: boolean; synced: number; keywords_synced: number; highlight_enabled: boolean }> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/clips/sync-editing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_clip_id: sourceClipId }),
    }),
  );
}

export async function getClipWords(
  jobId: string,
  clipId: string,
): Promise<{ words: Word[]; source: string }> {
  return jsonOrThrow(await apiFetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/words`));
}

export async function saveClipWords(
  jobId: string,
  clipId: string,
  words: Word[],
): Promise<{ words: Word[]; ok: boolean }> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/words`, {
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
    await apiFetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/render`, {
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
    await apiFetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/keywords`),
  );
}

export async function detectClipKeywords(
  jobId: string,
  clipId: string,
): Promise<KeywordsResult> {
  return jsonOrThrow(
    await apiFetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/keywords/detect`, {
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
    await apiFetch(`/api/jobs/${jobId}/clips/${encodeURIComponent(clipId)}/keywords`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indices }),
    }),
  );
}

export type HealthStatus = {
  ok: boolean;
  multi_tenant?: boolean;
  openai_configured: boolean | null;
  transcribe_engine: string;
  transcribe_ready: boolean;
  ffmpeg_ok: boolean;
  job_max_age_hours?: number | null;
};

export type MeProfile = {
  user_id: string;
  email: string;
  access_active: boolean;
  openai_configured: boolean;
  openai_key_status: "missing" | "unreadable" | "ready";
  multi_tenant: boolean;
  job_max_age_hours: number;
};

export type AppSettingsPublic = {
  openai_api_key_masked: string;
  openai_api_key_set: boolean;
  openai_base_url: string;
  transcribe_engine: string;
  openai_model: string;
  clips_model: string;
  keywords_model: string;
  enrich_model: string;
  configured: boolean;
  transcribe_ready: boolean;
  warnings: string[];
  source: "none" | "env" | "file" | "both";
  platform: string;
  mlx_available: boolean;
};

export type SettingsUpdatePayload = {
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
  return jsonOrThrow(await apiFetch("/api/health"));
}

export async function getMe(): Promise<MeProfile> {
  return jsonOrThrow(await apiFetch("/api/me"));
}

export async function updateMeSettings(openai_api_key: string): Promise<{ ok: boolean }> {
  return jsonOrThrow(
    await apiFetch("/api/me/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openai_api_key }),
    }),
  );
}

export async function testMeOpenAI(apiKey?: string): Promise<{ ok: boolean; message: string }> {
  return jsonOrThrow(
    await apiFetch("/api/me/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiKey ? { openai_api_key: apiKey } : {}),
    }),
  );
}

export async function getSettings(): Promise<AppSettingsPublic> {
  return jsonOrThrow(await apiFetch("/api/settings"));
}

export async function updateSettings(payload: SettingsUpdatePayload): Promise<AppSettingsPublic> {
  return jsonOrThrow(
    await apiFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function testOpenAI(apiKey?: string): Promise<{ ok: boolean; message: string }> {
  return jsonOrThrow(
    await apiFetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiKey ? { openai_api_key: apiKey } : {}),
    }),
  );
}

export type AdminSendAccessResult = {
  ok: boolean;
  email: string;
  user_id?: string;
  email_sent?: boolean;
  email_id?: string;
  access_link_generated?: boolean;
};

export async function getAdminSalesDashboard(): Promise<SalesDashboard> {
  return jsonOrThrow(await apiFetch("/api/admin/sales-dashboard"));
}

export async function adminSendAccess(
  email: string,
  name = "",
): Promise<AdminSendAccessResult> {
  return jsonOrThrow(
    await apiFetch("/api/admin/send-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    }),
  );
}
