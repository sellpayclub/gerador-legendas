"use client";

import type { JobState } from "@/lib/api";

type Props = {
  job: JobState | null;
};

export default function ProgressBar({ job }: Props) {
  const pct = Math.round((job?.progress ?? 0) * 100);
  const stage = job?.stage ?? "queued";
  const message = job?.message ?? "";
  const isError = stage === "error";
  const isDone = stage === "done";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className={isError ? "text-red-300" : isDone ? "text-green-300" : "text-zinc-200"}>
          {isError ? message || "Erro no processamento" : isDone ? "Concluído!" : message || "Processando..."}
        </span>
        {!isDone && !isError && <span className="text-zinc-500">{pct}%</span>}
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full transition-all ${
            isError ? "bg-red-500" : isDone ? "bg-green-500" : "bg-accent"
          } ${stage === "transcribing" || stage === "rendering" ? "" : "opacity-70"}`}
          style={{ width: `${isDone ? 100 : pct}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wide">
        <Step active={["transcribed", "generating_ass", "rendering", "done"].includes(stage)} label="Transcrição" />
        <Step active={["generating_ass", "rendering", "done"].includes(stage)} label="ASS" />
        <Step active={["rendering", "done"].includes(stage)} label="Render" />
        <Step active={stage === "done"} label="Download" />
      </div>
    </div>
  );
}

function Step({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`rounded px-2 py-1 text-center ${active ? "bg-accent/20 text-accent" : "bg-panel text-zinc-500"}`}>
      {label}
    </div>
  );
}
