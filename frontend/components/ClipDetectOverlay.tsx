"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Scissors, Sparkles } from "lucide-react";
import { CLIP_DETECT_STEPS, clipDetectProgressPct } from "@/lib/clipDetectProgress";

type Phase = "working" | "success";

type Props = {
  open: boolean;
  phase?: Phase;
  clipCount?: number;
};

export default function ClipDetectOverlay({
  open,
  phase = "working",
  clipCount = 0,
}: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!open || phase !== "working") return;
    setStepIdx(0);
    setProgress(0);
  }, [open, phase]);

  useEffect(() => {
    if (!open || phase !== "working") return;
    const stepTimer = window.setInterval(() => {
      setStepIdx((i) => (i + 1) % CLIP_DETECT_STEPS.length);
    }, 3200);
    const progTimer = window.setInterval(() => {
      setProgress(clipDetectProgressPct(Date.now() - startedAt));
    }, 400);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(progTimer);
    };
  }, [open, phase, startedAt]);

  useEffect(() => {
    if (phase === "success") setProgress(100);
  }, [phase]);

  if (!open) return null;

  const currentStep = CLIP_DETECT_STEPS[stepIdx];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-busy={phase === "working"}
      aria-label="Detectando cortes com IA"
    >
      <div className="absolute inset-0 bg-bg/75 backdrop-blur-xl" />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-accent/25 bg-panel/90 shadow-2xl shadow-black/40">
        <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-36 w-36 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative px-6 pb-6 pt-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
              {phase === "working" ? (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
                  <span className="absolute inset-1 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <Sparkles className="relative h-7 w-7 text-accent" />
                </>
              ) : (
                <CheckCircle2 className="h-14 w-14 scale-100 text-accent transition-transform duration-300" />
              )}
            </div>

            <h2 className="text-lg font-semibold text-zinc-100">
              {phase === "working" ? "IA analisando seu vídeo" : "Cortes prontos!"}
            </h2>
            <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-zinc-400 transition-opacity duration-500">
              {phase === "working" ? (
                currentStep
              ) : clipCount > 0 ? (
                <>
                  <span className="font-medium text-accent">{clipCount}</span>{" "}
                  {clipCount === 1 ? "corte encontrado" : "cortes encontrados"} — você já pode
                  continuar.
                </>
              ) : (
                "Análise concluída. Revise os resultados na lista."
              )}
            </p>
          </div>

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                {phase === "working" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-accent" />
                ) : (
                  <Scissors className="h-3 w-3 text-accent" />
                )}
                Editor profissional de cortes
              </span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/80 via-accent to-amber-300 transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {phase === "working" && (
            <ul className="space-y-2 border-t border-border/60 pt-4">
              {[0, 1, 2, 3].map((i) => {
                const label = CLIP_DETECT_STEPS[i];
                const cycle = stepIdx % CLIP_DETECT_STEPS.length;
                const done = i < (cycle % 4);
                const active = i === cycle % 4;
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-2 text-xs transition-colors ${
                      done ? "text-zinc-500" : active ? "text-zinc-200" : "text-zinc-600"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        done
                          ? "bg-accent/20 text-accent"
                          : active
                            ? "bg-accent/30 text-accent ring-2 ring-accent/40"
                            : "bg-zinc-800 text-zinc-600"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className="line-clamp-1">{label.replace("…", "")}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {phase === "working" && (
            <p className="mt-4 text-center text-[10px] text-zinc-600">
              Vídeos longos podem levar 5–15 minutos. Pode fechar e voltar depois — a análise
              continua em segundo plano.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
