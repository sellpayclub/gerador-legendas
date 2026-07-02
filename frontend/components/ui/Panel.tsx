"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  padding?: boolean;
};

export default function Panel({ children, className = "", padding = true }: Props) {
  return (
    <div
      className={`rounded-xl border border-border bg-panel ${padding ? "p-4" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
