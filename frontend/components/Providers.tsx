"use client";

import SupportChatWidget from "@/components/SupportChatWidget";
import { I18nProvider } from "@/lib/i18n/context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      {children}
      <SupportChatWidget />
    </I18nProvider>
  );
}
