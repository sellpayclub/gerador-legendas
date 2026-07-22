import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export async function getMobileSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) throw error || new Error("Não foi possível criar a sessão anônima.");
    session = data.session;
  }
  const response = await fetch(`${config.apiUrl}/api/mobile/session`, {
    method: "POST", headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error("Não foi possível iniciar sua sessão móvel.");
  return session;
}

export async function syncEntitlement(accessToken: string): Promise<boolean> {
  const response = await fetch(`${config.apiUrl}/api/mobile/entitlement/sync`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return false;
  return Boolean((await response.json()).premium);
}
