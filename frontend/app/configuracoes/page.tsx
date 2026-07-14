"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, GraduationCap, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getSettings,
  getMe,
  testOpenAI,
  testMeOpenAI,
  updateSettings,
  updateMeSettings,
  type AppSettingsPublic,
  type MeProfile,
} from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import Field from "@/components/ui/Field";
import Panel from "@/components/ui/Panel";
import HintBanner from "@/components/ui/HintBanner";
import { inputClass } from "@/components/ui/inputClass";
import AppTopNav from "@/components/AppTopNav";

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<AppSettingsPublic | null>(null);
  const [me, setMe] = useState<MeProfile | null>(null);
  const [hosted, setHosted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [transcribeEngine, setTranscribeEngine] = useState("openai");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMultiTenant()) {
        setHosted(true);
        const profile = await getMe();
        setMe(profile);
        setSettings(null);
        setApiKey("");
        return;
      }
      const s = await getSettings();
      setSettings(s);
      setTranscribeEngine(s.transcribe_engine || "openai");
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
      if (hosted) {
        if (!apiKey.trim()) {
          throw new Error("Informe sua API key OpenAI.");
        }
        await updateMeSettings(apiKey.trim());
        const profile = await getMe();
        setMe(profile);
        setApiKey("");
        setSaved(true);
        return;
      }
      const payload: Record<string, string> = {
        transcribe_engine: transcribeEngine,
        openai_base_url: openaiBaseUrl.trim(),
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

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : "Erro ao alterar senha");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const key = apiKey.trim() || undefined;
      const r = hosted ? await testMeOpenAI(key) : await testOpenAI(key);
      setTestResult(r);
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Falha no teste" });
    } finally {
      setTesting(false);
    }
  };

  const mlxBlocked =
    transcribeEngine === "mlx" && settings !== null && !settings.mlx_available;
  const showMlxOption = settings?.mlx_available ?? false;

  return (
    <main className="mx-auto max-w-2xl py-6">
      <AppTopNav maxWidth="max-w-2xl" />

      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">Configurações</h1>
        <Link
          href="/aulas"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <GraduationCap className="h-4 w-4" />
          Aulas
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-6">
          {hosted && me && (
            <>
              <HintBanner>
                Sua chave OpenAI — a cobrança vai direto na sua conta OpenAI. Conta:{" "}
                <strong>{me.email}</strong>
                {me.access_active ? "" : " (plano inativo — upload bloqueado)"}
                {" — "}
                <Link href="/aulas" className="text-accent underline">
                  ver Aula 01
                </Link>
              </HintBanner>
              <Panel className="space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">Conta e senha</h2>
                  <p className="mt-1 text-xs text-muted">
                    Altere sua senha de acesso ou defina uma se entrou apenas pelo link do e-mail.
                  </p>
                </div>
                <Field label="Nova senha">
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </Field>
                <Field label="Confirmar nova senha">
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={passwordSaving || !newPassword.trim()}
                    className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {passwordSaving ? "Salvando..." : "Alterar senha"}
                  </button>
                  <Link
                    href="/login/esqueci-senha"
                    className="inline-flex items-center px-2 py-2 text-sm text-accent hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
                {passwordSaved && (
                  <p className="text-sm text-green-400">Senha alterada com sucesso.</p>
                )}
                {passwordError && (
                  <p className="text-sm text-red-400">{passwordError}</p>
                )}
              </Panel>
              <Panel className="space-y-5">
                {me.openai_key_status === "unreadable" && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    A chave salva anteriormente não pode mais ser lida. Cole e salve a chave novamente.
                  </div>
                )}
                <Field
                  label="API Key OpenAI"
                  hint={
                    me.openai_configured
                      ? "Chave já configurada — cole uma nova para substituir"
                      : "Cole sua chave sk-..."
                  }
                >
                  <input
                    type="password"
                    autoComplete="off"
                    className={inputClass}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : "Salvar chave"}
                  </button>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {testing ? "Testando..." : "Testar conexão"}
                  </button>
                </div>
                {saved && (
                  <p className="text-sm text-green-400">Chave salva com sucesso.</p>
                )}
                {testResult && (
                  <p className={`text-sm ${testResult.ok ? "text-green-400" : "text-red-400"}`}>
                    {testResult.message}
                  </p>
                )}
              </Panel>
            </>
          )}

          {!hosted && settings?.source === "env" && (
            <HintBanner>
              Chave detectada em <code className="text-accent">backend/.env</code>. Salve aqui para
              migrar para o arquivo de configuração da interface (recomendado).
            </HintBanner>
          )}

          {!hosted && settings?.source === "both" && (
            <HintBanner>
              Configure <strong>só aqui</strong> ou só no <code className="text-accent">backend/.env</code> —
              não os dois ao mesmo tempo.
            </HintBanner>
          )}

          {!hosted && settings?.warnings.map((w) => (
            <div
              key={w}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            >
              {w}
            </div>
          ))}

          {!hosted && (
          <>
          <Panel className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">OpenAI</h2>
              <p className="mt-1 text-xs text-muted">
                Uma chave cobre transcrição, detecção de cortes e demais funções de IA.
                Crie em{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  platform.openai.com
                </a>
                .
              </p>
            </div>

            <Field
              label="API Key"
              hint={
                settings?.openai_api_key_set
                  ? `Atual: ${settings.openai_api_key_masked || "configurada"} — deixe em branco para manter`
                  : "Cole sua chave sk-..."
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
          </Panel>

          <Panel className="space-y-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Avançado (opcional)</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Motor de transcrição no Mac e URL alternativa da OpenAI
                </p>
              </div>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-muted transition ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>

            {advancedOpen && (
              <div className="space-y-4 border-t border-border pt-4">
                {showMlxOption && (
                  <>
                    <Field label="Motor de transcrição">
                      <select
                        value={transcribeEngine}
                        onChange={(e) => setTranscribeEngine(e.target.value)}
                        className={inputClass}
                      >
                        <option value="openai">OpenAI Whisper (recomendado)</option>
                        <option value="mlx">MLX local (Mac Apple Silicon, sem custo de API)</option>
                      </select>
                    </Field>
                    {mlxBlocked && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        MLX não está disponível neste servidor. Use OpenAI Whisper.
                      </div>
                    )}
                  </>
                )}

                <Field
                  label="URL base OpenAI"
                  hint="Deixe vazio para api.openai.com. Só altere se usar proxy compatível."
                >
                  <input
                    type="url"
                    value={openaiBaseUrl}
                    onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className={inputClass}
                  />
                </Field>

                <p className="text-xs text-muted">
                  Modelos de IA (cortes, keywords) usam padrões automáticos: gpt-4o e gpt-4o-mini.
                  Na VPS, domínio e HTTPS são configurados na instalação — não é necessário alterar aqui.
                </p>
              </div>
            )}
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
              "Salvar"
            )}
          </button>
          </>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
