import { createBrowserClient } from "@supabase/ssr";
import { isMultiTenant } from "@/lib/hosted";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
  }
  return createBrowserClient(url, key);
}

export async function getAccessToken(refresh = false): Promise<string | null> {
  if (!isMultiTenant()) return null;
  try {
    const supabase = createClient();
    if (refresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    }
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
