"use client";

import type { ReactNode } from "react";

type Props = {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

export default function Field({ label, hint, children, className = "" }: Props) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {hint && <p className="hint mb-1.5">{hint}</p>}
      {!hint && <span className="mb-1.5 block" />}
      {children}
    </label>
  );
}
