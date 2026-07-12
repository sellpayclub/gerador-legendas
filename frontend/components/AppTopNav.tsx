"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Home, Settings } from "lucide-react";
import ClipSaasLogo from "@/components/ClipSaasLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { isMultiTenant } from "@/lib/hosted";
import { useI18n } from "@/lib/i18n/context";

type Props = {
  className?: string;
  maxWidth?: string;
};

export default function AppTopNav({ className = "", maxWidth = "max-w-5xl" }: Props) {
  const pathname = usePathname();
  const hosted = isMultiTenant();
  const { t } = useI18n();

  const links = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/aulas", label: t("nav.lessons"), icon: GraduationCap },
    { href: "/configuracoes", label: t("nav.settings"), icon: Settings },
  ] as const;

  return (
    <nav
      className={`mb-6 flex w-full ${maxWidth} items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        {hosted && <ClipSaasLogo size="sm" showTagline={false} href="/" />}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <LanguageSwitcher />
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                active
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-panel text-zinc-300 hover:border-accent/40 hover:text-zinc-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
