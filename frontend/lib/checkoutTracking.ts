type PurchaseParams = {
  transactionId: string;
  valueCents: number;
};

const PURCHASE_DEDUPE_PREFIX = "clipsaas_purchase_";
const INITIATE_DEDUPE_PREFIX = "clipsaas_initiate_";
const GOOGLE_PURCHASE_CONVERSION = "AW-18308646046/PSjQCPip-swcEJ6Jn5pE";
const GOOGLE_INITIATE_CONVERSION = "AW-18308646046/9OkVCL6z_cwcEJ6Jn5pE";

function purchaseDedupeKey(transactionId: string, valueCents: number): string {
  return `${PURCHASE_DEDUPE_PREFIX}${transactionId || valueCents}`;
}

function alreadyTracked(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markTracked(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

function firePurchaseEvents(transactionId: string, value: number): boolean {
  let fired = false;

  if (typeof window !== "undefined" && (window as any).fbq) {
    const eventOptions = transactionId ? { eventID: transactionId } : undefined;
    (window as any).fbq(
      "track",
      "Purchase",
      { value, currency: "BRL" },
      eventOptions,
    );
    fired = true;
  }

  if (typeof window !== "undefined" && typeof (window as any).gtag === "function") {
    (window as any).gtag("event", "conversion", {
      send_to: GOOGLE_PURCHASE_CONVERSION,
      value,
      currency: "BRL",
      transaction_id: transactionId || undefined,
    });
    fired = true;
  }

  return fired;
}

function fireInitiateCheckoutEvents(value: number): boolean {
  let fired = false;

  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", "InitiateCheckout", {
      value,
      currency: "BRL",
    });
    fired = true;
  }

  if (typeof window !== "undefined" && typeof (window as any).gtag === "function") {
    (window as any).gtag("event", "conversion", {
      send_to: GOOGLE_INITIATE_CONVERSION,
      value,
      currency: "BRL",
    });
    fired = true;
  }

  return fired;
}

function whenTrackingReady(
  fire: () => boolean,
  onDone: () => void,
  maxWaitMs = 8000,
): void {
  const started = Date.now();
  const attempt = () => {
    const fbqReady = typeof window !== "undefined" && !!(window as any).fbq;
    const gtagReady =
      typeof window !== "undefined" && typeof (window as any).gtag === "function";

    if (fbqReady || gtagReady) {
      if (fire()) onDone();
      return;
    }

    if (Date.now() - started >= maxWaitMs) {
      if (fire()) onDone();
      return;
    }

    window.setTimeout(attempt, 100);
  };

  attempt();
}

/** Fire Purchase once per order. Safe to call multiple times (deduped). */
export function trackPurchase({ transactionId, valueCents }: PurchaseParams): void {
  if (!transactionId || !valueCents) return;

  const key = purchaseDedupeKey(transactionId, valueCents);
  if (alreadyTracked(key)) return;

  const value = valueCents / 100;
  if (firePurchaseEvents(transactionId, value)) {
    markTracked(key);
  }
}

/** Retry until fbq/gtag are ready (confirmacao / poll redirect). */
export function trackPurchaseWhenReady(
  params: PurchaseParams,
  maxWaitMs = 8000,
): void {
  const key = purchaseDedupeKey(params.transactionId, params.valueCents);
  if (alreadyTracked(key)) return;

  const value = params.valueCents / 100;
  whenTrackingReady(
    () => firePurchaseEvents(params.transactionId, value),
    () => markTracked(key),
    maxWaitMs,
  );
}

export function trackInitiateCheckout(valueCents: number): void {
  const key = `${INITIATE_DEDUPE_PREFIX}${valueCents}`;
  if (alreadyTracked(key)) return;

  const value = valueCents / 100;
  if (fireInitiateCheckoutEvents(value)) {
    markTracked(key);
  }
}

/** Wait for pixel before InitiateCheckout (PIX generated). */
export function trackInitiateCheckoutWhenReady(valueCents: number, maxWaitMs = 8000): void {
  const key = `${INITIATE_DEDUPE_PREFIX}${valueCents}`;
  if (alreadyTracked(key)) return;

  const value = valueCents / 100;
  whenTrackingReady(
    () => fireInitiateCheckoutEvents(value),
    () => markTracked(key),
    maxWaitMs,
  );
}

const PIX_DEDUPE_PREFIX = "clipsaas_pix_";

function fireGerouPixEvents(transactionId: string, value: number): boolean {
  let fired = false;
  if (typeof window !== "undefined" && (window as any).fbq) {
    const eventOptions = transactionId ? { eventID: transactionId } : undefined;
    (window as any).fbq("trackCustom", "Gerou_PIX", {
      value,
      currency: "BRL",
    }, eventOptions);
    fired = true;
  }
  return fired;
}

export function trackGerouPixWhenReady(transactionId: string, valueCents: number, maxWaitMs = 8000): void {
  const key = `${PIX_DEDUPE_PREFIX}${transactionId || valueCents}`;
  if (alreadyTracked(key)) return;

  const value = valueCents / 100;
  whenTrackingReady(
    () => fireGerouPixEvents(transactionId, value),
    () => markTracked(key),
    maxWaitMs,
  );
}
