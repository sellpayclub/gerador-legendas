"use client";

import { Info } from "lucide-react";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export default function HintBanner({ children, className = "" }: Props) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-sm leading-snug text-zinc-300 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span>{children}</span>
    </div>
  );
}
