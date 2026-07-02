"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  step?: number;
  className?: string;
};

export default function Section({
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
  step,
  className = "",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const header = (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      {step != null && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
          {step}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
    </div>
  );

  if (!collapsible) {
    return (
      <section className={`space-y-3 ${className}`}>
        {header}
        {children}
      </section>
    );
  }

  return (
    <section className={`rounded-xl border border-border bg-surface/40 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-panel/50"
      >
        {header}
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}
