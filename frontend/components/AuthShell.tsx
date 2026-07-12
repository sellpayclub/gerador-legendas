import type { ReactNode } from "react";
import ClipSaasLogo from "@/components/ClipSaasLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="relative flex min-h-[calc(100vh-3rem)] items-center justify-center py-10">
      <div className="absolute right-0 top-0">
        <LanguageSwitcher />
      </div>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(250,204,21,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(250,204,21,0.06), transparent)",
        }}
      />
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <ClipSaasLogo size="lg" />
        </div>
        <div className="rounded-2xl border border-border bg-panel p-8 shadow-xl shadow-black/20">
          <h1 className="mb-1 text-center text-xl font-bold text-zinc-100">{title}</h1>
          {subtitle && (
            <p className="mb-6 text-center text-sm text-muted">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-6" />}
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
