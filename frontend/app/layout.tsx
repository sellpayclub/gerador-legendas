import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const isHosted = process.env.NEXT_PUBLIC_MULTI_TENANT === "true";

export const metadata: Metadata = {
  title: isHosted ? "ClipSaaS — Gerador de Legendas" : "Legendas Locais",
  description: isHosted
    ? "Gere legendas e cortes virais com IA"
    : "Legendas automaticas estilo CapCut - uso pessoal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-zinc-100 antialiased">
        <Providers>
          <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
