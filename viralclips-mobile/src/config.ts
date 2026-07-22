export const config = {
  appUrl: process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, "") || "",
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || "",
  entitlement: "ClipSaaS Pro",
} as const;

export function missingConfiguration(): string | null {
  if (!config.appUrl || !config.apiUrl || !config.supabaseUrl || !config.supabaseAnonKey) return "Configuração do aplicativo incompleta.";
  if (!config.revenueCatAndroidKey || !config.revenueCatAndroidKey.startsWith("goog_")) return "A chave pública Android do RevenueCat ainda não foi configurada.";
  return null;
}
