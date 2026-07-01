import type { Metadata } from "next";
import { Inter, Lato, Montserrat, Open_Sans, Raleway, Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-open-sans",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-raleway",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-inter",
  display: "swap",
});

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
    <html
      lang="pt-BR"
      className={`${roboto.variable} ${openSans.variable} ${lato.variable} ${raleway.variable} ${montserrat.variable} ${inter.variable}`}
    >
      <body className="min-h-screen bg-bg text-zinc-100 antialiased">
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
