export type PixPendingEmailData = {
  customerName: string;
  customerEmail: string;
  totalCents: number;
  items: Array<{ name: string; price_cents: number }>;
  brCode: string;
  qrCodeImageUrl: string;
  paymentLinkUrl: string;
  expiresMinutes: number;
  checkoutUrl: string;
};

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function itemsHtml(items: Array<{ name: string; price_cents: number }>): string {
  if (!items.length) return "";
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;color:#d4d4d8;font-size:14px">${esc(item.name)}</td>` +
        `<td style="padding:8px 0;color:#fafafa;font-size:14px;text-align:right;font-weight:600">${esc(formatBrl(item.price_cents))}</td></tr>`,
    )
    .join("");
  return (
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" ' +
    'style="margin:0 0 20px;border-collapse:collapse">' +
    rows +
    "</table>"
  );
}

export function buildPixPendingEmailHtml(data: PixPendingEmailData): string {
  const greeting = esc(data.customerName.trim() || "cliente");
  const total = esc(formatBrl(data.totalCents));
  const safeBr = esc(data.brCode);
  const safeQr = esc(data.qrCodeImageUrl);
  const safeLink = esc(data.paymentLinkUrl);
  const safeCheckout = esc(data.checkoutUrl);

  const payButton = data.paymentLinkUrl
    ? `<p style="margin:0 0 24px;text-align:center">
          <a href="${safeLink}"
             style="display:inline-block;background:#22c55e;color:#fff;padding:16px 32px;
                    border-radius:12px;font-weight:700;text-decoration:none;font-size:17px">
            Pagar com PIX
          </a>
        </p>`
    : "";

  const qrBlock = data.qrCodeImageUrl
    ? `<div style="text-align:center;margin:0 0 20px">
          <p style="margin:0 0 12px;font-size:14px;color:#a1a1aa">Escaneie o QR Code no app do seu banco</p>
          <img src="${safeQr}" alt="QR Code PIX" width="220" height="220"
               style="display:block;margin:0 auto;border-radius:12px;background:#fff;padding:8px" />
        </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#fafafa;
             margin:0;padding:32px 16px">
  <div style="max-width:560px;margin:0 auto;background:#18181b;border-radius:16px;
              padding:32px 24px;border:1px solid #27272a">
    <h1 style="margin:0 0 8px;font-size:24px">Seu PIX está pronto</h1>
    <p style="color:#a1a1aa;margin:0 0 20px;line-height:1.5">
      Olá, ${greeting}! Finalize o pagamento do <strong style="color:#fafafa">ClipSaaS</strong>
      em até <strong style="color:#facc15">${data.expiresMinutes} minutos</strong>.
    </p>

    <div style="background:#27272a;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #3f3f46">
      <p style="margin:0 0 12px;font-size:13px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em">
        Resumo do pedido
      </p>
      ${itemsHtml(data.items)}
      <p style="margin:0;font-size:18px;font-weight:700;color:#fafafa;text-align:right">
        Total: ${total}
      </p>
    </div>

    ${payButton}
    ${qrBlock}

    <div style="background:#1c1917;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #3f3f46">
      <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;font-weight:600">PIX Copia e Cola</p>
      <p style="margin:0;font-size:11px;line-height:1.6;word-break:break-all;color:#e4e4e7;
                font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#09090b;
                padding:12px;border-radius:8px">${safeBr}</p>
    </div>

    <p style="font-size:13px;color:#a1a1aa;line-height:1.6;margin:0 0 16px">
      Se o PIX expirar, volte ao checkout e gere um novo código:
      <a href="${safeCheckout}" style="color:#facc15">${safeCheckout}</a>
    </p>
    <p style="font-size:12px;color:#71717a;line-height:1.5;margin:0">
      Após o pagamento, você receberá outro e-mail com login e senha de acesso à plataforma.
    </p>
  </div>
</body>
</html>`;
}

export async function sendPixPendingEmail(
  data: PixPendingEmailData,
  correlationId: string,
): Promise<{ ok: boolean; email_id: string | null; error: string | null }> {
  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const fromEmail = (Deno.env.get("RESEND_FROM_EMAIL") ?? "").trim().replace(
    /^["']|["']$/g,
    "",
  );
  if (!apiKey || !fromEmail) {
    return { ok: false, email_id: null, error: "Resend não configurado" };
  }
  if (!data.brCode.trim()) {
    return { ok: false, email_id: null, error: "brCode vazio" };
  }

  const totalLabel = formatBrl(data.totalCents);
  const html = buildPixPendingEmailHtml(data);
  const payload = {
    from: fromEmail,
    to: [data.customerEmail],
    subject: `Seu PIX ClipSaaS — ${totalLabel} (válido por ${data.expiresMinutes} min)`,
    html,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `pix-pending/${correlationId}`,
    },
    body: JSON.stringify(payload),
  });

  const resBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) {
    return {
      ok: true,
      email_id: (resBody.id as string) ?? null,
      error: null,
    };
  }
  const msg = (resBody.message as string) ?? JSON.stringify(resBody);
  return { ok: false, email_id: null, error: msg };
}
