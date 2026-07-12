export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
};

const STORAGE_KEY = "clipsaas_attribution";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function buildFbc(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`;
}

export function loadAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

/** Persist UTMs + Meta cookies from URL on first checkout visit. */
export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const prev = loadAttribution();

  const fbclid = params.get("fbclid") || prev.fbclid;
  const fbc =
    readCookie("_fbc") || prev.fbc || (fbclid ? buildFbc(fbclid) : undefined);
  const fbp = readCookie("_fbp") || prev.fbp;

  const next: Attribution = {
    utm_source: params.get("utm_source") || prev.utm_source,
    utm_medium: params.get("utm_medium") || prev.utm_medium,
    utm_campaign: params.get("utm_campaign") || prev.utm_campaign,
    utm_content: params.get("utm_content") || prev.utm_content,
    utm_term: params.get("utm_term") || prev.utm_term,
    fbclid,
    fbc,
    fbp,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }

  return next;
}
