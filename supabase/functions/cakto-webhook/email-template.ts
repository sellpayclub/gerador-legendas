export type PurchaseEmailData = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  productName: string;
  orderId: string;
  amount: string;
  paidAt: string;
  loginUrl: string;
  loginPassword: string | null;
  isNewUser?: boolean;
  accessLink: string | null;
};

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function row(label: string, value: string): string {
  if (!value.trim()) return "";
  return `
    <tr>
      <td style="padding:8px 0;color:#a1a1aa;font-size:14px;width:120px;vertical-align:top">${esc(label)}</td>
      <td style="padding:8px 0;color:#fafafa;font-size:14px;font-weight:500">${esc(value)}</td>
    </tr>`;
}

export function buildPurchaseEmailHtml(data: PurchaseEmailData): string {
  const greeting = data.customerName.trim() || "cliente";
  const quickAccessBlock = data.accessLink
    ? `
        <p style="margin:20px 0 0;font-size:13px;color:#71717a;line-height:1.5">
          Prefere entrar com um clique?
          <a href="${esc(data.accessLink)}" style="color:#facc15">Acesso rápido (link direto)</a>
        </p>`
    : "";
  const passwordRow = data.loginPassword
    ? row("Senha", data.loginPassword)
    : row("Senha", "Use sua senha atual ou clique em Esqueci minha senha");
  const passwordHelp = data.loginPassword
    ? "Guarde esta senha. Você pode trocá-la depois em <strong>Configurações → Conta e senha</strong>."
    : "Sua senha não foi alterada. Se não lembrar, use <strong>Esqueci minha senha</strong> na tela de login.";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#09090b;color:#fafafa;margin:0;padding:32px 16px">
  <div style="max-width:600px;margin:0 auto">
    <div style="text-align:center;margin-bottom:24px">
      <span style="display:inline-block;background:#27272a;border:1px solid #3f3f46;
                   border-radius:999px;padding:8px 16px;font-size:13px;color:#facc15;font-weight:600">
        ClipSaaS — Acesso liberado
      </span>
    </div>
    <div style="background:#18181b;border-radius:16px;padding:32px;border:1px solid #27272a">
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:700">Compra aprovada!</h1>
      <p style="color:#a1a1aa;margin:0 0 28px;font-size:16px;line-height:1.5">
        Olá, <strong style="color:#fafafa">${esc(greeting)}</strong>! Seu acesso ao
        <strong style="color:#fafafa">${esc(data.productName)}</strong> foi liberado com sucesso.
      </p>

      <div style="background:#14532d;border-radius:12px;padding:24px;margin-bottom:28px;border:2px solid #22c55e">
        <p style="margin:0 0 16px;font-size:13px;color:#86efac;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">
          Seus dados de acesso
        </p>
        <table style="width:100%;border-collapse:collapse">
          ${row("Login (e-mail)", data.customerEmail)}
          ${passwordRow}
          ${row("Entrar em", data.loginUrl)}
        </table>
        <p style="margin:20px 0 0">
          <a href="${esc(data.loginUrl)}"
             style="display:inline-block;background:#facc15;color:#09090b;padding:14px 28px;
                    border-radius:10px;font-weight:700;text-decoration:none;font-size:16px">
            Entrar na plataforma
          </a>
        </p>
        ${quickAccessBlock}
        <p style="margin:16px 0 0;font-size:12px;color:#86efac;line-height:1.5">
          ${passwordHelp}
        </p>
      </div>

      <div style="background:#27272a;border-radius:12px;padding:20px;margin-bottom:28px;border:1px solid #3f3f46">
        <p style="margin:0 0 12px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">
          Dados da compra
        </p>
        <table style="width:100%;border-collapse:collapse">
          ${row("Nome", data.customerName)}
          ${row("E-mail", data.customerEmail)}
          ${row("Celular", data.customerPhone)}
          ${row("Produto", data.productName)}
          ${row("Pedido", data.orderId)}
          ${row("Valor", data.amount)}
          ${row("Pago em", data.paidAt)}
        </table>
      </div>

      <div style="background:#27272a;border-radius:12px;padding:20px;margin:28px 0;border:1px solid #3f3f46">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#fafafa">Como começar</p>
        <ol style="margin:0;padding-left:20px;color:#d4d4d8;line-height:1.8;font-size:14px">
          <li>Acesse <strong>${esc(data.loginUrl)}</strong> pelo link direto ou com seus dados acima</li>
          <li>Vá em <strong>Configurações</strong> e cadastre sua chave OpenAI</li>
          <li>Envie seu vídeo e gere legendas ou cortes virais</li>
        </ol>
      </div>

      <hr style="border:none;border-top:1px solid #3f3f46;margin:28px 0">
      <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0">
        Anexamos o <strong style="color:#fafafa">Manual de Instalação</strong> (PDF) com o passo a passo
        completo para usar o Gerador de Legendas, e o bônus
        <strong style="color:#fafafa">Guia: Como Ganhar Dinheiro com Cortes Virais</strong> (ebook em PDF).
      </p>
      <p style="font-size:12px;color:#52525b;margin-top:24px;line-height:1.5">
        Dúvidas? Responda este e-mail ou fale com nosso suporte.<br>
        ClipSaaS — Gerador de Legendas
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}

export function formatAmount(value: unknown): string {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPaidAt(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}
