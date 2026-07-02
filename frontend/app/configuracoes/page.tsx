"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  getSettings,
  testOpenAI,
  updateSettings,
  type AppSettingsPublic,
} from "@/lib/api";
import Field from "@/components/ui/Field";
import Panel from "@/components/ui/Panel";
import HintBanner from "@/components/ui/HintBanner";
import { inputClass } from "@/components/ui/inputClass";

const CLIPS_MODELS = ["gpt-4o", "gpt-5.5", "gpt-4o-mini"];
const AUX_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-5.5"];
const WHISPER_MODELS = ["whisper-1"];

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<AppSettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [transcribeEngine, setTranscribeEngine] = useState("openai");
  const [openaiModel, setOpenaiModel] = useState("whisper-1");
  const [clipsModel, setClipsModel] = useState("gpt-4o");
  const [keywordsModel, setKeywordsModel] = useState("gpt-4o-mini");
  const [enrichModel, setEnrichModel] = useState("gpt-4o-mini");
  const [publicDomain, setPublicDomain] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getSettings();
      setSettings(s);
      setTranscribeEngine(s.transcribe_engine || "openai");
      setOpenaiModel(s.openai_model || "whisper-1");
      setClipsModel(s.clips_model || "gpt-4o");
      setKeywordsModel(s.keywords_model || "gpt-4o-mini");
      setEnrichModel(s.enrich_model || "gpt-4o-mini");
      setPublicDomain(s.public_domain || "");
      setOpenaiBaseUrl(s.openai_base_url || "");
      setApiKey("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    setTestResult(null);
    try {
      const payload: Record<string, string> = {
        transcribe_engine: transcribeEngine,
        openai_model: openaiModel,
        clips_model: clipsModel,
        keywords_model: keywordsModel,
        enrich_model: enrichModel,
        public_domain: publicDomain.trim(),
        openai_base_url: openaiBaseUrl.trim(),
        llm_provider: "openai",
      };
      if (apiKey.trim()) {
        payload.openai_api_key = apiKey.trim();
      }
      const s = await updateSettings(payload);
      setSettings(s);
      setApiKey("");
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const key = apiKey.trim() || undefined;
      const r = await testOpenAI(key);
      setTestResult(r);
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Falha no teste" });
    } finally {
      setTesting(false);
    }
  };

  const mlxBlocked =
    transcribeEngine === "mlx" && settings !== null && !settings.mlx_available;

  return (
    <main className="mx-auto max-w-2xl py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">Configurações</h1>
        <span className="w-16" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-6">
          {settings?.source === "env" && (
            <HintBanner>
              Chave detectada em <code className="text-accent">backend/.env</code>. Salve aqui para
              migrar para o arquivo de configuração da interface.
            </HintBanner>
          )}

          {settings?.warnings.map((w) => (
            <div
              key={w}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            >
              {w}
            </div>
          ))}

          <Panel className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">OpenAI</h2>
              <p className="mt-1 text-xs text-muted">
                Uma chave cobre transcrição (Whisper) e IA de cortes, keywords e enrich.
              </p>
            </div>

            <Field
              label="API Key"
              hint={
                settings?.openai_api_key_set
                  ? `Atual: ${settings.openai_api_key_masked || "configurada"} — deixe em branco para manter`
                  : "Cole sua chave sk-... da OpenAI"
              }
            >
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={inputClass}
                autoComplete="off"
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || (!apiKey.trim() && !settings?.openai_api_key_set)}
                className="rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-accent/50 disabled:opacity-50"
              >
                {testing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testando...
                  </span>
                ) : (
                  "Testar conexão"
                )}
              </button>
              {testResult && (
                <span
                  className={`inline-flex items-center gap-1.5 text-sm ${
                    testResult.ok ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult.message}
                </span>
              )}
            </div>

            <Field
              label="URL base (opcional)"
              hint="Deixe vazio para api.openai.com. Use para APIs compatíveis com OpenAI no futuro."
            >
              <input
                type="url"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputClass}
              />
            </Field>
          </Panel>

          <Panel className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Transcrição</h2>
            </div>

            <Field label="Motor">
              <select
                value={transcribeEngine}
                onChange={(e) => setTranscribeEngine(e.target.value)}
                className={inputClass}
              >
                <option value="openai">OpenAI Whisper (recomendado — Mac e VPS)</option>
                <option value="mlx">MLX local (somente Mac Apple Silicon)</option>
              </select>
            </Field>

            {mlxBlocked && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                MLX não está disponível neste servidor ({settings?.platform}). Use OpenAI Whisper na VPS.
              </div>
            )}

            <Field label="Modelo Whisper">
              <select
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                className={inputClass}
                disabled={transcribeEngine !== "openai"}
              >
                {WHISPER_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </Panel>

          <Panel className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Modelos de IA</h2>
            </div>

            <Field label="Detecção de cortes" hint="gpt-4o — recomendado (rápido e estável). gpt-5.5 pode falhar em vídeos longos.">
              <select value={clipsModel} onChange={(e) => setClipsModel(e.target.value)} className={inputClass}>
                {CLIPS_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Keywords (destaque de palavras)">
              <select
                value={keywordsModel}
                onChange={(e) => setKeywordsModel(e.target.value)}
                className={inputClass}
              >
                {AUX_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Enrich (pontuação e emojis)">
              <select value={enrichModel} onChange={(e) => setEnrichModel(e.target.value)} className={inputClass}>
                {AUX_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </Panel>

          <Panel className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Domínio (VPS)</h2>
              <p className="mt-1 text-xs text-muted">
                Se instalou em um servidor com domínio próprio, informe aqui. Uso local pode ficar em branco.
              </p>
            </div>

            <Field label="URL pública" hint="Ex: https://legendas.seudominio.com">
              <input
                type="text"
                value={publicDomain}
                onChange={(e) => setPublicDomain(e.target.value)}
                placeholder="https://meudominio.com"
                className={inputClass}
              />
            </Field>

            {settings?.allowed_origins.length ? (
              <p className="text-xs text-muted">
                Origins CORS: {settings.allowed_origins.join(", ")}
              </p>
            ) : null}
          </Panel>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {saved && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Configurações salvas com sucesso.
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || mlxBlocked}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-bg transition hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </span>
            ) : (
              "Salvar configurações"
            )}
          </button>
        </div>
      )}
    </main>
  );
}
