"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { LOCALE_OPTIONS, useI18n, type Locale } from "@/lib/i18n/context";

type Props = {
  className?: string;
  compact?: boolean;
};

export default function LanguageSwitcher({ className = "", compact = false }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = LOCALE_OPTIONS.find((o) => o.id === locale) ?? LOCALE_OPTIONS[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100"
        aria-label={t("lang.label")}
        aria-expanded={open}
      >
        <Globe className="h-4 w-4 shrink-0 text-accent" />
        <span className="text-base leading-none">{current.flag}</span>
        {!compact && <span>{t(`lang.${locale}`)}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-border bg-panel py-1 shadow-xl shadow-black/40">
          {LOCALE_OPTIONS.map((opt) => {
            const active = opt.id === locale;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setLocale(opt.id as Locale);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                }`}
              >
                <span className="text-base">{opt.flag}</span>
                <span>{t(`lang.${opt.id}`)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
