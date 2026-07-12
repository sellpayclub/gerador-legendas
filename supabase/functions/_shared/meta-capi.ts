const GRAPH_API = "https://graph.facebook.com/v21.0";

type OrderRow = Record<string, unknown>;

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Phone(phone: string): Promise<string> {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  if (!normalized) return "";
  return sha256Hex(normalized);
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function eventTimeFromOrder(order: OrderRow): number {
  const paidAt = String(order.paid_at ?? "");
  if (paidAt) {
    const t = Date.parse(paidAt);
    if (!Number.isNaN(t)) return Math.floor(t / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function eventSourceUrl(order: OrderRow): string | undefined {
  const base = (env("APP_PUBLIC_URL") || "https://app.clipsaas.site").replace(/\/$/, "");
  const params = new URLSearchParams();
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    const val = order[key];
    if (val) params.set(key, String(val));
  }
  const fbclid = order.fbclid;
  if (fbclid) params.set("fbclid", String(fbclid));
  const qs = params.toString();
  return qs ? `${base}/checkout?${qs}` : `${base}/checkout`;
}

export async function sendMetaPurchase(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null }>;
        };
      };
      update: (body: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    };
  },
  order: OrderRow,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const correlationId = String(order.correlation_id ?? "").trim();
  if (!correlationId) return { ok: false, error: "missing correlation_id" };
  if (order.meta_purchase_sent_at) return { ok: true, skipped: true };

  let pixelId = env("META_PIXEL_ID");
  let token = env("META_CAPI_ACCESS_TOKEN");

  if (!pixelId || !token) {
    const { data: settings } = await supabase
      .from("global_settings")
      .select("fb_pixel_id, meta_capi_token")
      .eq("id", "default")
      .single();
    if (!pixelId && settings?.fb_pixel_id) {
      pixelId = String(settings.fb_pixel_id).trim();
    }
    if (!token && settings?.meta_capi_token) {
      token = String(settings.meta_capi_token).trim();
    }
  }

  if (!pixelId || !token) {
    return { ok: false, error: "META pixel/token not configured" };
  }

  const email = String(order.customer_email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "missing email" };

  const totalCents = Number(order.total_cents ?? 0);
  const value = Math.round((totalCents / 100) * 100) / 100;

  const userData: Record<string, unknown> = {
    em: [await sha256Hex(email)],
  };
  const phoneHash = await sha256Phone(String(order.customer_whatsapp ?? ""));
  if (phoneHash) userData.ph = [phoneHash];
  const fbc = String(order.fbc ?? "").trim();
  const fbp = String(order.fbp ?? "").trim();
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  const customData: Record<string, unknown> = {
    value,
    currency: "BRL",
    order_id: correlationId,
  };
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ]) {
    const val = order[key];
    if (val) customData[key] = String(val);
  }

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTimeFromOrder(order),
        event_id: correlationId,
        action_source: "website",
        event_source_url: eventSourceUrl(order),
        user_data: userData,
        custom_data: customData,
      },
    ],
    access_token: token,
  };

  const res = await fetch(`${GRAPH_API}/${pixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    return { ok: false, error: JSON.stringify(body.error ?? body) };
  }
  if ((body.events_received ?? 0) < 1) {
    return { ok: false, error: `events_received=${body.events_received}` };
  }

  await supabase
    .from("orders")
    .update({ meta_purchase_sent_at: new Date().toISOString() })
    .eq("correlation_id", correlationId);

  return { ok: true };
}
