import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legendas Locais",
  description: "Legendas automaticas estilo CapCut - uso pessoal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-bg text-zinc-100 antialiased">
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
