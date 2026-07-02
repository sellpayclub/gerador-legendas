"use client";

import type { ReactNode } from "react";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
};

type Props<T extends string> = {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
};

export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: Props<T>) {
  return (
    <div className={`flex shrink-0 border-b border-border ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
              isActive
                ? "border-b-2 border-accent text-accent"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
