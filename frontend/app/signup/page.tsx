"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";
import Field from "@/components/ui/Field";
import HintBanner from "@/components/ui/HintBanner";
import { inputClass } from "@/components/ui/inputClass";
import { useI18n } from "@/lib/i18n/context";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) throw err;
      setDone(true);
      router.replace("/plano-inativo");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("auth.signupError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t("auth.signupTitle")}
      subtitle={t("auth.signupSubtitle")}
      footer={
        <>
          {t("auth.hasAccount")}{" "}
          <Link href="/login" className="text-accent hover:underline">
            {t("auth.loginSubmit")}
          </Link>
        </>
      }
    >
      <HintBanner>{t("auth.signupHint")}</HintBanner>
      {done ? (
        <p className="mt-4 text-sm text-zinc-300">{t("auth.signupDone")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
          <Field label={t("auth.signupPasswordLabel")}>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-zinc-950 transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("auth.signupSubmit")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
