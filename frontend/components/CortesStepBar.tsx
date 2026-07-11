"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";

type Step = 1 | 2 | 3;

type Props = {
  step: Step;
  onStep?: (s: Step) => void;
};

export default function CortesStepBar({ step, onStep }: Props) {
  const { t } = useI18n();
  const steps = useMemo(
    () =>
      ([1, 2, 3] as Step[]).map((n) => ({
        n,
        label: t(`cortes.steps.${n}.label`),
        shortLabel: n === 3 ? t(`cortes.steps.${n}.short`) : t(`cortes.steps.${n}.label`),
        hint: t(`cortes.steps.${n}.hint`),
      })),
    [t],
  );

  return (
    <div className="mb-3 shrink-0 rounded-xl border border-border bg-panel px-2 py-2 sm:px-4 sm:py-2.5">
      <div className="flex items-center gap-1 sm:gap-2">
        {steps.map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          const clickable = onStep && (done || s.n <= step);
          return (
            <div key={s.n} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              {i > 0 && (
                <div
                  className={`hidden h-px flex-1 sm:block ${done ? "bg-accent/40" : "bg-border"}`}
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStep?.(s.n)}
                className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition sm:px-3 ${
                  active
                    ? "bg-accent/10 text-accent ring-1 ring-accent/25"
                    : done
                      ? "text-zinc-300 hover:bg-panel/80"
                      : "text-zinc-500"
                } ${clickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-8 sm:w-8 ${
                    active
                      ? "bg-accent text-bg"
                      : done
                        ? "bg-accent/20 text-accent"
                        : "bg-border text-zinc-500"
                  }`}
                >
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold sm:text-sm">
                    <span className="sm:hidden">{s.shortLabel}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </span>
                  <span className="hidden truncate text-xs text-muted sm:block">{s.hint}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { Step as CortesStep };
