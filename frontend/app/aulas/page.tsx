"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, PlayCircle } from "lucide-react";
import AppTopNav from "@/components/AppTopNav";
import Panel from "@/components/ui/Panel";
import { AULAS, youtubeEmbedUrl, youtubeWatchUrl, type Aula } from "@/lib/aulas";
import { useI18n } from "@/lib/i18n/context";

function AulaVideo({ aula, title }: { aula: Aula; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <div className="relative aspect-video w-full">
        <iframe
          key={aula.youtubeId}
          src={youtubeEmbedUrl(aula.youtubeId)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}

export default function AulasPage() {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(AULAS[0]?.id ?? "");
  const aula = useMemo(
    () => AULAS.find((a) => a.id === selectedId) ?? AULAS[0],
    [selectedId],
  );

  if (!aula) return null;

  const title = t(`lessons.items.${aula.i18nKey}.title`);
  const desc = t(`lessons.items.${aula.i18nKey}.desc`);
  const steps = t(`lessons.items.${aula.i18nKey}.steps.0`)
    ? [0, 1, 2, 3, 4].map((i) => t(`lessons.items.${aula.i18nKey}.steps.${i}`)).filter(Boolean)
    : [];

  return (
    <main className="mx-auto max-w-5xl py-6 sm:py-10">
      <AppTopNav maxWidth="max-w-5xl" />

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">{t("lessons.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{t("lessons.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
            {t("lessons.sidebar")}
          </p>
          {AULAS.map((item) => {
            const active = item.id === aula.id;
            const itemTitle = t(`lessons.items.${item.i18nKey}.title`);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-accent/50 bg-accent/10 ring-1 ring-accent/20"
                    : "border-border bg-panel hover:border-zinc-600"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    active ? "bg-accent text-zinc-950" : "bg-bg text-zinc-400"
                  }`}
                >
                  {String(item.numero).padStart(2, "0")}
                </span>
                <span>
                  <span className={`block text-sm font-medium ${active ? "text-accent" : "text-zinc-200"}`}>
                    {itemTitle}
                  </span>
                  {item.duracao && (
                    <span className="mt-0.5 block text-xs text-muted">{item.duracao}</span>
                  )}
                </span>
              </button>
            );
          })}
        </aside>

        <div className="space-y-6">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-accent">
              {t("lessons.lessonNumber", { num: String(aula.numero).padStart(2, "0") })}
            </p>
            <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
          </div>

          <AulaVideo aula={aula} title={title} />

          <div className="flex flex-wrap gap-3">
            <Link
              href="/configuracoes"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-accent/90"
            >
              <PlayCircle className="h-4 w-4" />
              {t("lessons.goToSettings")}
            </Link>
            <a
              href={youtubeWatchUrl(aula.youtubeId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-4 py-2.5 text-sm text-zinc-200 transition hover:border-accent/40"
            >
              <ExternalLink className="h-4 w-4" />
              {t("lessons.openYoutube")}
            </a>
          </div>

          {steps.length > 0 && (
            <Panel className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">{t("lessons.afterWatching")}</h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
                {steps.map((passo) => (
                  <li key={passo}>{passo}</li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
