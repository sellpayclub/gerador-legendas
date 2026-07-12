"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";
import Field from "@/components/ui/Field";
import { inputClass } from "@/components/ui/inputClass";
import { useI18n } from "@/lib/i18n/context";

export default function EsqueciSenhaPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/callback?next=/auth/atualizar-senha`,
      });
      if (err) throw err;
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("auth.forgotError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t("auth.forgotTitle")}
      subtitle={sent ? undefined : t("auth.forgotSubtitle")}
      footer={
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.forgotBack")}
        </Link>
      }
    >
      {sent ? (
        <p className="text-center text-sm leading-relaxed text-zinc-300">{t("auth.forgotSent")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("common.email")}>
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-zinc-950 transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("auth.forgotSubmit")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
