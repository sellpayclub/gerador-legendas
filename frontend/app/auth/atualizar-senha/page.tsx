"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/AuthShell";
import Field from "@/components/ui/Field";
import { inputClass } from "@/components/ui/inputClass";

export default function AtualizarSenhaPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login?next=/auth/atualizar-senha");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar a senha");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <AuthShell title="Carregando..." subtitle="">
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Definir nova senha"
      subtitle={
        done
          ? undefined
          : "Escolha uma senha segura para acessar sua conta no futuro."
      }
      footer={
        !done ? (
          <Link href="/login" className="text-accent hover:underline">
            Voltar ao login
          </Link>
        ) : null
      }
    >
      {done ? (
        <p className="text-center text-sm text-green-400">
          Senha atualizada! Redirecionando...
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nova senha">
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
          <Field label="Confirmar senha">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-zinc-950 transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar senha
          </button>
        </form>
      )}
    </AuthShell>
  );
}
