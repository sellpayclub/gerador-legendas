"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminSendAccess, getAdminSalesDashboard, type SalesDashboard } from "@/lib/api";
import AppTopNav from "@/components/AppTopNav";

function brl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

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
  const [sales, setSales] = useState<SalesDashboard | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
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

      const [{ data: settings }, salesData] = await Promise.all([
        supabase
          .from("global_settings")
          .select("fb_pixel_id, meta_capi_token")
          .eq("id", "default")
          .single(),
        getAdminSalesDashboard().catch((err) => {
          setSalesError(err instanceof Error ? err.message : "Não foi possível carregar as vendas.");
          return null;
        }),
      ]);
        
      if (settings) {
        setPixelId(settings.fb_pixel_id || "");
        setMetaCapiToken(settings.meta_capi_token || "");
      }
      if (salesData) setSales(salesData);
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
      
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Painel Admin</h1>
          <p className="text-zinc-400 text-sm mt-1">Vendas, clientes e configurações globais do ClipSaaS</p>
        </div>

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Visão de vendas</h2>
              <p className="mt-1 text-sm text-zinc-400">Pedidos pagos, atualizados automaticamente.</p>
            </div>
            {sales?.generated_at && <span className="text-xs text-zinc-500">Atualizado agora</span>}
          </div>

          {salesError ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">{salesError}</div>
          ) : !sales ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-400">Carregando dados de vendas...</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Faturamento deste mês" value={brl(sales.month_revenue_cents)} detail={`${sales.month_sales_count} venda${sales.month_sales_count === 1 ? "" : "s"} paga${sales.month_sales_count === 1 ? "" : "s"}`} accent="text-emerald-400" />
                <MetricCard label="Vendas totais" value={String(sales.total_sales_count)} detail={`${sales.customers_count} cliente${sales.customers_count === 1 ? "" : "s"} único${sales.customers_count === 1 ? "" : "s"}`} accent="text-sky-400" />
                <MetricCard label="Faturamento total" value={brl(sales.total_revenue_cents)} detail={`Ano atual: ${brl(sales.year_revenue_cents)}`} accent="text-amber-300" />
                <MetricCard label="Receita anualizada" value={brl(sales.annualized_revenue_cents)} detail="Projeção: mês atual × 12" accent="text-violet-400" />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <p className="text-sm font-medium text-zinc-200">ARR estimado</p>
                  <p className="mt-2 text-3xl font-bold text-violet-300">{brl(sales.annualized_revenue_cents)}</p>
                  <p className="mt-3 text-xs leading-5 text-zinc-500">Como o acesso é vitalício, este valor é uma projeção anual baseada no faturamento do mês atual — não uma cobrança recorrente contratada.</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium text-zinc-200">Faturamento dos últimos 6 meses</p><span className="text-xs text-zinc-500">R$</span></div>
                  <div className="flex h-32 items-end gap-2">
                    {sales.monthly_series.map((item) => {
                      const max = Math.max(...sales.monthly_series.map((month) => month.revenue_cents), 1);
                      const height = Math.max(8, Math.round((item.revenue_cents / max) * 100));
                      return <div key={item.label} className="flex h-full flex-1 flex-col justify-end gap-2 text-center"><div title={`${item.label}: ${brl(item.revenue_cents)}`} className="rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-300 transition-opacity hover:opacity-80" style={{ height: `${height}%` }} /><span className="text-[10px] text-zinc-500">{item.label}</span></div>;
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-5 py-4">
                  <div><h3 className="font-semibold text-zinc-100">Clientes e vendas</h3><p className="mt-1 text-xs text-zinc-500">Todos os clientes com pelo menos um pedido pago.</p></div>
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">{sales.clients.length} clientes</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">WhatsApp</th><th className="px-5 py-3 font-medium">Vendas</th><th className="px-5 py-3 font-medium">Total pago</th><th className="px-5 py-3 font-medium">Última compra</th></tr></thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {sales.clients.map((client) => <tr key={client.email || `${client.name}-${client.last_paid_at}`} className="text-zinc-300"><td className="px-5 py-3"><div className="font-medium text-zinc-100">{client.name}</div><div className="mt-0.5 text-xs text-zinc-500">{client.email || "E-mail não informado"}</div></td><td className="px-5 py-3 text-zinc-400">{client.whatsapp || "—"}</td><td className="px-5 py-3">{client.purchases_count}</td><td className="px-5 py-3 font-semibold text-emerald-400">{brl(client.total_cents)}</td><td className="px-5 py-3 text-zinc-400">{formatDate(client.last_paid_at)}</td></tr>)}
                      {!sales.clients.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">Ainda não há vendas pagas.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>

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

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><p className="text-sm text-zinc-400">{label}</p><p className={`mt-2 text-2xl font-bold ${accent}`}>{value}</p><p className="mt-2 text-xs text-zinc-500">{detail}</p></div>;
}
