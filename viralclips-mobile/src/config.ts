export const config = {
  appUrl: process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, "") || "",
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || "",
  allowRevenueCatTestKey: process.env.EXPO_PUBLIC_ALLOW_REVENUECAT_TEST_KEY === "true",
  entitlement: "ClipSaaS Pro",
} as const;

export function missingConfiguration(): string | null {
  if (!config.appUrl || !config.apiUrl || !config.supabaseUrl || !config.supabaseAnonKey) return "Configuração do aplicativo incompleta.";
  if (!config.revenueCatAndroidKey) return "A chave do RevenueCat ainda não foi configurada.";
  const validProductionKey = config.revenueCatAndroidKey.startsWith("goog_");
  const permittedTestKey = config.allowRevenueCatTestKey && config.revenueCatAndroidKey.startsWith("test_");
  if (!validProductionKey && !permittedTestKey) {
    return "Use a chave pública Android do RevenueCat, ou habilite a chave Test Store somente no build interno.";
  }
  return null;
}
