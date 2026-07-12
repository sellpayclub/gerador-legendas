import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildPurchaseEmailHtml,
  formatAmount,
  type PurchaseEmailData,
} from "../cakto-webhook/email-template.ts";
import { sendMetaPurchase } from "../_shared/meta-capi.ts";
import { loadPurchaseAttachments } from "../_shared/email-attachments.ts";
import {
  sendPixPendingEmail,
  type PixPendingEmailData,
} from "../_shared/pix-pending-email.ts";

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
  if (
    value.length >= 2 &&
    value[0] === value.at(-1) &&
    (value[0] === '"' || value[0] === "'")
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function appPublicUrl(): string {
  return stripQuotes(env("APP_PUBLIC_URL")) || "https://app.clipsaas.site";
}

function authCallbackUrl(): string {
  return `${appPublicUrl().replace(/\/$/, "")}/auth/callback`;
}

function normalizeMagicLink(actionLink: string): string {
  try {
    const url = new URL(actionLink);
    url.searchParams.set("redirect_to", authCallbackUrl());
    return url.toString();
  } catch {
    return actionLink;
  }
}

function generatePassword(): string {
  const fixed = stripQuotes(env("DEFAULT_CUSTOMER_PASSWORD"));
  if (fixed) return fixed;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `Clip@${id}`;
}

function parseOrderItems(raw: unknown): Array<{ name: string; price_cents: number }> {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "Item");
      const price_cents = Number(row.price_cents ?? 0);
      return { name, price_cents };
    })
    .filter((item) => item.name);
}

async function handleChargeCreated(
  body: Record<string, unknown>,
  charge: Record<string, unknown>,
  correlationID: string,
): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("correlation_id", correlationID)
    .limit(1);

  const order = orders?.[0] ?? null;
  if (order?.pix_email_sent_at) {
    console.log(`openpix CHARGE_CREATED: pix email already sent for ${correlationID}`);
    return jsonResponse({ ok: true, skipped: true, reason: "already_sent" });
  }

  const customer = (charge.customer ?? {}) as Record<string, unknown>;
  const email = String(
    order?.customer_email ?? customer.email ?? "",
  )
    .trim()
    .toLowerCase();
  if (!email) {
    console.log(`openpix CHARGE_CREATED: no email for ${correlationID}`);
    return jsonResponse({ ok: true, skipped: true, reason: "no_email" });
  }

  const customerName = String(order?.customer_name ?? customer.name ?? "").trim();
  const totalCents = Number(order?.total_cents ?? charge.value ?? 0);
  const items = parseOrderItems(order?.items);
  const fallbackItems =
    items.length > 0
      ? items
      : [{ name: "ClipSaaS — Gerador de Legendas", price_cents: totalCents }];

  const expiresMinutes = Math.max(
    1,
    Math.round(Number(charge.expiresIn ?? 300) / 60),
  );

  const emailData: PixPendingEmailData = {
    customerName,
    customerEmail: email,
    totalCents,
    items: fallbackItems,
    brCode: String(charge.brCode ?? ""),
    qrCodeImageUrl: String(charge.qrCodeImage ?? ""),
    paymentLinkUrl: String(charge.paymentLinkUrl ?? ""),
    expiresMinutes,
    checkoutUrl: `${appPublicUrl().replace(/\/$/, "")}/checkout`,
  };

  const emailResult = await sendPixPendingEmail(emailData, correlationID);

  if (emailResult.ok && order) {
    await supabase
      .from("orders")
      .update({
        pix_email_sent_at: new Date().toISOString(),
        pix_email_id: emailResult.email_id,
      })
      .eq("correlation_id", correlationID);
  }

  await supabase
    .from("webhook_events")
    .upsert(
      {
        order_id: `openpix-pix-${correlationID}`,
        event: "OPENPIX:CHARGE_CREATED",
        email,
        status: emailResult.ok ? "ok" : "error",
        email_id: emailResult.email_id,
        error_message: emailResult.error,
        payload: body,
      },
      { onConflict: "order_id" },
    )
    .then(({ error }) => {
      if (error) console.error("webhook_events upsert failed:", error.message);
    });

  console.log(
    `openpix CHARGE_CREATED: pix email to ${email} ok=${emailResult.ok}`,
  );

  return jsonResponse({
    ok: emailResult.ok,
    correlation_id: correlationID,
    email,
    email_sent: emailResult.ok,
    email_id: emailResult.email_id,
    error: emailResult.error,
  });
}

async function handleChargeCompleted(
  body: Record<string, unknown>,
  charge: Record<string, unknown>,
  correlationID: string,
  event: string,
): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("correlation_id", correlationID)
      .limit(1);

    if (orderError) throw new Error(`orders lookup: ${orderError.message}`);

    const order = orders?.[0];
    if (!order) {
      console.log(`openpix webhook: order not found for ${correlationID}`);
      return jsonResponse({ ok: true, ignored: true, reason: "order not found" });
    }

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("correlation_id", correlationID);

    if (updateOrderError) {
      console.error(`order update failed: ${updateOrderError.message}`);
    }

    const email = String(order.customer_email).trim().toLowerCase();
    const customerName = String(order.customer_name || "").trim();
    const password = generatePassword();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .limit(1);

    let userId = profiles?.[0]?.id ? String(profiles[0].id) : null;

    if (!userId) {
      const { data: created, error: createError } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          password,
        });
      if (createError) throw new Error(`create user: ${createError.message}`);
      userId = created.user?.id ?? null;
      if (!userId) throw new Error("create user: missing id");
    } else {
      const { error: pwError } = await supabase.auth.admin.updateUserById(
        userId,
        { password },
      );
      if (pwError) throw new Error(`set password: ${pwError.message}`);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        access_active: true,
        email,
        plan_name: "ClipSaaS — Gerador de Legendas",
        cakto_customer_id: correlationID,
        ...(customerName ? { name: customerName } : {}),
      })
      .eq("id", userId);

    if (profileError) throw new Error(`update profile: ${profileError.message}`);

    let accessLink: string | null = null;
    try {
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: authCallbackUrl() },
        });
      if (!linkError) {
        const props = (linkData as { properties?: { action_link?: string } })
          .properties;
        const raw = props?.action_link ?? null;
        accessLink = raw ? normalizeMagicLink(raw) : null;
      }
    } catch (e) {
      console.warn("magic link failed:", e);
    }

    const apiKey = env("RESEND_API_KEY");
    const fromEmail = stripQuotes(env("RESEND_FROM_EMAIL"));
    const loginUrl = `${appPublicUrl().replace(/\/$/, "")}/login`;

    let emailResult = { ok: false, email_id: null as string | null, error: "skipped" };

    if (apiKey && fromEmail) {
      const emailData: PurchaseEmailData = {
        customerName,
        customerEmail: email,
        customerPhone: order.customer_whatsapp || "",
        productName: "ClipSaaS — Gerador de Legendas",
        orderId: correlationID,
        amount: formatAmount(order.total_cents),
        paidAt: new Date().toLocaleDateString("pt-BR"),
        accessLink,
        loginUrl,
        loginPassword: password,
      };

      const html = buildPurchaseEmailHtml(emailData);
      const attachments = await loadPurchaseAttachments(supabase);
      const payload: Record<string, unknown> = {
        from: fromEmail,
        to: [email],
        subject: `Acesso liberado — ClipSaaS`,
        html,
      };
      if (attachments?.length) payload.attachments = attachments;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `openpix/${correlationID}`,
        },
        body: JSON.stringify(payload),
      });

      const resBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        emailResult = {
          ok: true,
          email_id: (resBody.id as string) ?? null,
          error: null as unknown as string,
        };
        console.log(`purchase email sent to ${email}, id=${emailResult.email_id}`);
      } else {
        const msg = (resBody.message as string) ?? JSON.stringify(resBody);
        emailResult = { ok: false, email_id: null, error: msg };
        console.error(`email failed for ${email}: ${msg}`);
      }
    }

    await supabase
      .from("webhook_events")
      .upsert(
        {
          order_id: `openpix-${correlationID}`,
          event,
          email,
          status: emailResult.ok ? "ok" : "error",
          email_id: emailResult.email_id,
          error_message: emailResult.error,
          payload: body,
        },
        { onConflict: "order_id" },
      )
      .then(({ error }) => {
        if (error) console.error("webhook_events upsert failed:", error.message);
      });

    const orderForMeta = {
      ...order,
      status: "paid",
      paid_at: new Date().toISOString(),
    };
    const metaResult = await sendMetaPurchase(supabase, orderForMeta);
    if (!metaResult.ok && !metaResult.skipped) {
      console.warn(`Meta CAPI failed for ${correlationID}: ${metaResult.error}`);
    }

    return jsonResponse({
      ok: true,
      user_id: userId,
      email,
      correlation_id: correlationID,
      access_link_generated: Boolean(accessLink),
      email_sent: emailResult.ok,
      meta_capi: metaResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("openpix webhook error:", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const event = String(body.event ?? "").trim();
  const charge = (body.charge ?? {}) as Record<string, unknown>;
  const correlationID = String(charge.correlationID ?? "").trim();

  if (!correlationID) {
    console.log(`openpix webhook: test ping (event=${event})`);
    return new Response(null, { status: 200 });
  }

  if (event === "OPENPIX:CHARGE_CREATED") {
    return handleChargeCreated(body, charge, correlationID);
  }

  if (event === "OPENPIX:CHARGE_COMPLETED") {
    return handleChargeCompleted(body, charge, correlationID, event);
  }

  console.log(`openpix webhook ignored event: ${event}`);
  return jsonResponse({ ok: true, ignored: event });
});
