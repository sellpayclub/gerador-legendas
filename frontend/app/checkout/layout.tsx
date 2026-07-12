import type { Metadata } from "next";
import Script from "next/script";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Checkout — ClipSaaS",
  description:
    "Adquira o ClipSaaS — Gerador de Legendas com IA. Pagamento seguro via PIX.",
};

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("global_settings")
    .select("fb_pixel_id")
    .eq("id", "default")
    .single();
    
  const pixelId = data?.fb_pixel_id || null;

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto bg-slate-50">
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=AW-18308646046"
        strategy="afterInteractive"
      />
      <Script
        id="google-ads-gtag"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            gtag('js', new Date());
            gtag('config', 'AW-18308646046');
          `,
        }}
      />
      {pixelId && (
        <Script
          id="fb-pixel"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');
            `,
          }}
        />
      )}
      {children}
    </div>
  );
}
