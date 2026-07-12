import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildPurchaseEmailHtml,
  formatAmount,
  formatPaidAt,
  formatPhone,
  type PurchaseEmailData,
} from "./email-template.ts";
import { loadPurchaseAttachments } from "../_shared/email-attachments.ts";

const ACTIVATE_EVENTS = new Set([
  "purchase_approved",
  "subscription_renewed",
  "subscription_created",
]);
const DEACTIVATE_EVENTS = new Set([
  "subscription_canceled",
  "refund",
  "chargeback",
  "chargedback",
]);

type CaktoPayload = {
  secret?: string;
  event?: string;
  data?: Record<string, unknown>;
};

type CaktoCustomer = {
  email?: string;
  name?: string;
  full_name?: string;
  phone?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function extractEmail(data: Record<string, unknown>): string | null {
  const customer = data.customer as CaktoCustomer | undefined;
  if (customer?.email) return String(customer.email).trim().toLowerCase();
  for (const key of ["buyer", "client"] as const) {
    const block = data[key] as CaktoCustomer | undefined;
    if (block?.email) return String(block.email).trim().toLowerCase();
  }
  if (data.email) return String(data.email).trim().toLowerCase();
  return null;
}

function extractCustomerName(data: Record<string, unknown>): string {
  const customer = data.customer as CaktoCustomer | undefined;
  if (customer?.name) return String(customer.name).trim();
  if (customer?.full_name) return String(customer.full_name).trim();
  return "";
}

function extractPhone(data: Record<string, unknown>): string {
  const customer = data.customer as CaktoCustomer | undefined;
  return customer?.phone ? formatPhone(String(customer.phone)) : "";
}

function extractProductName(data: Record<string, unknown>): string {
  const product = data.product as { name?: string } | undefined;
  if (product?.name) return String(product.name).trim();
  const offer = data.offer as { name?: string } | undefined;
  if (offer?.name) return String(offer.name).trim();
  return "ClipSaaS — Gerador de Legendas";
}

function extractOrderId(data: Record<string, unknown>): string {
  for (const key of ["id", "refId", "checkout"] as const) {
    const val = data[key];
    if (val != null && String(val).trim()) return String(val);
  }
  return "unknown";
}

async function logWebhookEvent(
  supabase: ReturnType<typeof createClient>,
  row: {
    order_id: string;
    event: string;
    email: string;
    status: string;
    email_id?: string | null;
    error_message?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("webhook_events").upsert(row, { onConflict: "order_id" });
  if (error) console.error("webhook_events upsert failed:", error.message);
}

async function ensureUserWithPassword(
  supabase: ReturnType<typeof createClient>,
  email: string,
  orderId: string,
): Promise<{ userId: string; password: string }> {
  const password = generateCustomerPassword(orderId);

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);

  if (profileError) throw new Error(`profiles lookup: ${profileError.message}`);

  let userId = profiles?.[0]?.id ? String(profiles[0].id) : null;

  if (!userId) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    if (createError) throw new Error(`create user: ${createError.message}`);
    userId = created.user?.id ?? null;
    if (!userId) throw new Error("create user: missing id");
    return { userId, password };
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
  if (updateError) throw new Error(`set password: ${updateError.message}`);

  return { userId, password };
}

function generateCustomerPassword(orderId: string): string {
  const fixed = stripQuotes(env("DEFAULT_CUSTOMER_PASSWORD"));
  if (fixed) return fixed;
  const slug = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "acesso";
  return `Clip@${slug}`;
}

function appPublicUrl(): string {
  return stripQuotes(env("APP_PUBLIC_URL")) || "https://app.clipsaas.site";
}

function authCallbackUrl(): string {
  return `${appPublicUrl().replace(/\/$/, "")}/auth/callback`;
}

function normalizeMagicLink(actionLink: string): string {
  const callback = authCallbackUrl();
  try {
    const url = new URL(actionLink);
    url.searchParams.set("redirect_to", callback);
    return url.toString();
  } catch {
    return actionLink;
  }
}

async function generateAccessLink(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const redirectTo = authCallbackUrl();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error) {
    console.warn("magic link failed:", error.message);
    return null;
  }
  const props = (data as { properties?: { action_link?: string } }).properties;
  const raw = props?.action_link ?? null;
  return raw ? normalizeMagicLink(raw) : null;
}

async function sendPurchaseEmail(params: {
  toEmail: string;
  emailData: PurchaseEmailData;
  orderId: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<{ ok: boolean; email_id?: string; error?: string }> {
  const apiKey = env("RESEND_API_KEY");
  const fromEmail = stripQuotes(env("RESEND_FROM_EMAIL"));
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY não configurada" };
  if (!fromEmail) return { ok: false, error: "RESEND_FROM_EMAIL não configurado" };

  const html = buildPurchaseEmailHtml(params.emailData);
  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: [params.toEmail],
    subject: `Acesso liberado — ${params.emailData.productName}`,
    html,
  };
  if (params.attachments?.length) payload.attachments = params.attachments;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `purchase-approved/${params.orderId}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { message?: string }).message ?? JSON.stringify(body);
    return { ok: false, error: msg };
  }
  const emailId = (body as { id?: string }).id;
  return { ok: true, email_id: emailId };
}

async function activatePurchase(
  supabase: ReturnType<typeof createClient>,
  event: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const email = extractEmail(data);
  if (!email) {
    return { ok: false, error: "email não encontrado no payload" };
  }

  const customerName = extractCustomerName(data);
  const customerPhone = extractPhone(data);
  const productName = extractProductName(data);
  const orderId = extractOrderId(data);
  const appUrl = stripQuotes(env("APP_PUBLIC_URL")) || "https://app.clipsaas.site";
  const loginUrl = `${appUrl.replace(/\/$/, "")}/login`;

  const { userId, password: loginPassword } = await ensureUserWithPassword(
    supabase,
    email,
    orderId,
  );

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      access_active: true,
      email,
      plan_name: productName,
      cakto_customer_id: orderId,
      ...(customerName ? { name: customerName } : {}),
    })
    .eq("id", userId);

  if (updateError) throw new Error(`update profile: ${updateError.message}`);

  const accessLink = await generateAccessLink(supabase, email);
  const attachments = await loadPurchaseAttachments(supabase);

  const emailResult = await sendPurchaseEmail({
    toEmail: email,
    orderId,
    attachments,
    emailData: {
      customerName,
      customerEmail: email,
      customerPhone,
      productName,
      orderId,
      amount: formatAmount(data.amount),
      paidAt: formatPaidAt(data.paidAt),
      accessLink,
      loginUrl,
      loginPassword,
    },
  });

  await logWebhookEvent(supabase, {
    order_id: orderId,
    event,
    email,
    status: emailResult.ok ? "ok" : "error",
    email_id: emailResult.email_id ?? null,
    error_message: emailResult.error ?? null,
    payload: data,
  });

  if (!emailResult.ok) {
    console.error(`email failed for ${email}:`, emailResult.error);
  } else {
    console.log(`purchase activated for ${email}, email_id=${emailResult.email_id}`);
  }

  return {
    ok: true,
    user_id: userId,
    email,
    order_id: orderId,
    access_link_generated: Boolean(accessLink),
    email_sent: emailResult.ok,
    email_id: emailResult.email_id ?? null,
    email_error: emailResult.error ?? null,
  };
}

async function deactivatePurchase(
  supabase: ReturnType<typeof createClient>,
  event: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const email = extractEmail(data);
  if (!email) return { ok: false, error: "email não encontrado no payload" };

  const orderId = extractOrderId(data);
  const { data: profiles } = await supabase.from("profiles").select("id").eq("email", email).limit(1);
  const userId = profiles?.[0]?.id;

  if (userId) {
    await supabase.from("profiles").update({ access_active: false, email }).eq("id", userId);
  }

  await logWebhookEvent(supabase, {
    order_id: `${orderId}-${event}`,
    event,
    email,
    status: "ok",
    payload: data,
  });

  return { ok: true, deactivated: true, email };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  let body: CaktoPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const expectedSecret = env("CAKTO_WEBHOOK_SECRET");
  const receivedSecret = (body.secret ?? "").trim();
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    console.warn(
      `invalid cakto secret (received_len=${receivedSecret.length}, expected_len=${expectedSecret.length})`,
    );
    return jsonResponse({ error: "secret inválido" }, 403);
  }

  const event = (body.event ?? "").trim();
  const data = (body.data ?? {}) as Record<string, unknown>;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    if (ACTIVATE_EVENTS.has(event)) {
      const result = await activatePurchase(supabase, event, data);
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (DEACTIVATE_EVENTS.has(event)) {
      const result = await deactivatePurchase(supabase, event, data);
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    await logWebhookEvent(supabase, {
      order_id: `${extractOrderId(data)}-${event}`,
      event,
      email: extractEmail(data) ?? "unknown",
      status: "ignored",
      payload: data,
    });

    return jsonResponse({ ok: true, ignored: event });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cakto webhook error:", message);
    await logWebhookEvent(supabase, {
      order_id: `${extractOrderId(data)}-error`,
      event,
      email: extractEmail(data) ?? "unknown",
      status: "error",
      error_message: message,
      payload: data,
    }).catch(() => {});
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
