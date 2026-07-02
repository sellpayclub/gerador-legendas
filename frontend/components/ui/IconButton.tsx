"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "default" | "danger" | "accent";
  size?: "md" | "sm";
};

const variantClass = {
  default: "text-zinc-400 hover:bg-border/60 hover:text-zinc-100",
  danger: "text-zinc-500 hover:bg-red-500/10 hover:text-red-400",
  accent: "text-accent hover:bg-accent/10",
};

export default function IconButton({
  children,
  variant = "default",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: Props) {
  const sizeClass = size === "md" ? "h-10 w-10" : "h-9 w-9";
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 ${sizeClass} ${variantClass[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
