"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminSendAccess } from "@/lib/api";
import AppTopNav from "@/components/AppTopNav";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [metaCapiToken, setMetaCapiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessName, setAccessName] = useState("");
  const [sendingAccess, setSendingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
        
      if (!profile?.is_admin) {
        router.push("/");
        return;
      }
      
      setIsAdmin(true);

      const { data: settings } = await supabase
        .from("global_settings")
        .select("fb_pixel_id, meta_capi_token")
        .eq("id", "default")
        .single();
        
      if (settings) {
        setPixelId(settings.fb_pixel_id || "");
        setMetaCapiToken(settings.meta_capi_token || "");
      }
      setLoading(false);
    }
    
    checkAdmin();
  }, [router, supabase]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    
    await supabase
      .from("global_settings")
      .upsert({
        id: "default",
        fb_pixel_id: pixelId.trim(),
        meta_capi_token: metaCapiToken.trim(),
      });
      
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSendAccess = async () => {
    const email = accessEmail.trim().toLowerCase();
    if (!email) {
      setAccessError("Informe o e-mail do cliente.");
      setAccessMessage(null);
      return;
    }

    setSendingAccess(true);
    setAccessError(null);
    setAccessMessage(null);

    try {
      const result = await adminSendAccess(email, accessName.trim());
      setAccessMessage(
        `Acesso enviado para ${result.email}. O cliente receberá login, senha e link de acesso por e-mail.`,
      );
      setAccessEmail("");
      setAccessName("");
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "Erro ao enviar acesso.");
    } finally {
      setSendingAccess(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <AppTopNav />
        <div className="flex-1 flex items-center justify-center text-zinc-400">
          Carregando painel admin...
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <AppTopNav />
      
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Painel Admin</h1>
          <p className="text-zinc-400 text-sm mt-1">Configurações globais do ClipSaaS</p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Enviar acesso manual
          </h2>

          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Use quando o PIX ou webhook falhar. Cria ou reativa a conta e envia e-mail com login, senha e link de acesso.
            </p>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                E-mail do cliente
              </label>
              <input
                type="email"
                value={accessEmail}
                onChange={(e) => setAccessEmail(e.target.value)}
                placeholder="cliente@email.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-green-500 transition-colors max-w-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Nome (opcional)
              </label>
              <input
                type="text"
                value={accessName}
                onChange={(e) => setAccessName(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-green-500 transition-colors max-w-md"
              />
            </div>

            {accessError && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3 max-w-md">
                {accessError}
              </p>
            )}

            {accessMessage && (
              <p className="text-sm text-green-400 bg-green-950/40 border border-green-900/50 rounded-lg px-4 py-3 max-w-md">
                {accessMessage}
              </p>
            )}

            <div className="pt-2">
              <button
                onClick={handleSendAccess}
                disabled={sendingAccess}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {sendingAccess ? "Enviando acesso..." : "Enviar acesso"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            Facebook Pixel (Checkout)
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Pixel ID Principal
              </label>
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-green-500 transition-colors max-w-md"
              />
              <p className="text-xs text-zinc-500 mt-2">
                Carregado no checkout. Purchase dispara no browser e via Conversions API (server).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Token Conversions API (Meta)
              </label>
              <input
                type="password"
                value={metaCapiToken}
                onChange={(e) => setMetaCapiToken(e.target.value)}
                placeholder="EAA..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-green-500 transition-colors max-w-md"
              />
              <p className="text-xs text-zinc-500 mt-2">
                Events Manager → Configurações → Conversions API → Gerar token de acesso. Usado para Purchase server-side com UTMs.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Salvando...
                  </>
                ) : saved ? (
                  "Salvo com sucesso ✓"
                ) : (
                  "Salvar Pixel"
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
