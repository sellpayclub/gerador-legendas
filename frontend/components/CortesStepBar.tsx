"use client";

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1 as Step, label: "Cortes", hint: "Detectar e revisar trechos" },
  { n: 2 as Step, label: "Legendas", hint: "Estilo e texto" },
  { n: 3 as Step, label: "Exportar", hint: "Gerar e baixar MP4s" },
];

type Props = {
  step: Step;
  onStep?: (s: Step) => void;
};

export default function CortesStepBar({ step, onStep }: Props) {
  return (
    <div className="mb-3 shrink-0 rounded-xl border border-border bg-panel px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
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
                className={`flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition sm:px-2 ${
                  active
                    ? "bg-accent/10 text-accent"
                    : done
                      ? "text-zinc-300 hover:bg-panel/80"
                      : "text-zinc-500"
                } ${clickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    active
                      ? "bg-accent text-bg"
                      : done
                        ? "bg-accent/20 text-accent"
                        : "bg-border text-zinc-500"
                  }`}
                >
                  {s.n}
                </span>
                <span className="min-w-0 hidden sm:block">
                  <span className="block truncate text-xs font-semibold">{s.label}</span>
                  <span className="block truncate text-[10px] opacity-70">{s.hint}</span>
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
