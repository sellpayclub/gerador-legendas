"use client";

import Link from "next/link";
import HintBanner from "@/components/ui/HintBanner";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/context";

export default function PlanoInativoPage() {
  const { t } = useI18n();

  return (
    <main className="mx-auto max-w-lg py-16 text-center">
      <div className="mb-6 flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-zinc-100">{t("planInactive.title")}</h1>
      <p className="mb-6 text-muted">{t("planInactive.body")}</p>
      <HintBanner>{t("planInactive.hint")}</HintBanner>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/configuracoes"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-surface"
        >
          {t("planInactive.configureOpenAi")}
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-zinc-950"
        >
          {t("planInactive.backToLogin")}
        </Link>
      </div>
    </main>
  );
}
