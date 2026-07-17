"use client";

import { useEffect, useState } from "react";
import { trackPurchaseWhenReady } from "@/lib/checkoutTracking";

const LOGO_URL = "/brand/logo-clipsaas.png";

async function fulfillAccess(transactionId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(
        `/api/checkout/fulfill/${encodeURIComponent(transactionId)}`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (
        data.ok &&
        (data.fulfillment?.email_sent === true ||
          data.fulfillment?.already_fulfilled === true)
      ) {
        return true;
      }
      if (data.reason === "payment_not_completed") return false;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export default function ConfirmacaoPage() {
  const [accessPending, setAccessPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId =
      params.get("tid") || sessionStorage.getItem("checkout_tid") || "";
    const valueCents = params.get("v") ? parseInt(params.get("v")!, 10) : null;

    if (transactionId && valueCents) {
      trackPurchaseWhenReady({ transactionId, valueCents });
    }

    if (!transactionId) return;

    let cancelled = false;
    (async () => {
      const ok = await fulfillAccess(transactionId);
      if (!cancelled && !ok) setAccessPending(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Confetti particles */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 8 + Math.random() * 6,
              height: 8 + Math.random() * 6,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              background: [
                "#22c55e",
                "#facc15",
                "#3b82f6",
                "#ef4444",
                "#a855f7",
                "#14b8a6",
              ][i % 6],
              left: `${Math.random() * 100}%`,
              top: `-${10 + Math.random() * 20}%`,
              opacity: 0.7,
              animation: `confettiFall ${3 + Math.random() * 4}s ease-in-out ${Math.random() * 2}s infinite`,
            }}
          />
        ))}
      </div>

      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <img
          src={LOGO_URL}
          alt="ClipSaaS"
          style={{ height: 36, marginBottom: 32, objectFit: "contain" }}
          draggable={false}
        />

        {/* Animated Checkmark */}
        <div
          style={{
            width: 96,
            height: 96,
            margin: "0 auto 24px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "scaleIn 0.5s ease",
            boxShadow: "0 0 40px rgba(34, 197, 94, 0.3)",
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: "drawCheck 0.6s ease 0.3s both" }}
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: "#18181b",
            margin: "0 0 8px",
            animation: "fadeUp 0.5s ease 0.3s both",
          }}
        >
          Pagamento confirmado! 🎉
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "#52525b",
            lineHeight: 1.6,
            margin: "0 0 32px",
            animation: "fadeUp 0.5s ease 0.5s both",
          }}
        >
          {accessPending
            ? "Estamos liberando seu acesso. Se o e-mail não chegar em alguns minutos, fale conosco pelo suporte."
            : "Seus dados de acesso foram enviados para o seu e-mail."}
          <br />
          <span style={{ fontSize: 13, color: "#71717a" }}>
            Verifique sua caixa de entrada e spam.
          </span>
        </p>

        {/* Instructions card */}
        <div
          style={{
            background: "#f0fdf4",
            border: "2px solid #22c55e",
            borderRadius: 16,
            padding: "24px 20px",
            textAlign: "left",
            marginBottom: 24,
            animation: "fadeUp 0.5s ease 0.7s both",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "#16a34a",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 700,
              margin: "0 0 16px",
            }}
          >
            Próximos passos
          </p>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              color: "#374151",
              lineHeight: 2,
              fontSize: 14,
            }}
          >
            <li>
              Acesse o <strong style={{ color: "#18181b" }}>e-mail</strong> com
              seus dados de login
            </li>
            <li>
              Entre em{" "}
              <strong style={{ color: "#ca8a04" }}>
                app.clipsaas.site/login
              </strong>
            </li>
            <li>
              Configure sua chave <strong style={{ color: "#18181b" }}>OpenAI</strong>
            </li>
            <li>
              Comece a{" "}
              <strong style={{ color: "#22c55e" }}>gerar legendas e cortes virais!</strong>
            </li>
          </ol>
        </div>

        {/* CTA Button */}
        <a
          href="https://app.clipsaas.site/login"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "16px",
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            borderRadius: 12,
            background: "#facc15",
            color: "#09090b",
            textDecoration: "none",
            cursor: "pointer",
            transition: "all 0.2s",
            animation: "fadeUp 0.5s ease 0.9s both",
          }}
        >
          Ir para o Login →
        </a>

        <p
          style={{
            fontSize: 12,
            color: "#52525b",
            marginTop: 24,
            animation: "fadeUp 0.5s ease 1.1s both",
          }}
        >
          Obrigado pela compra! Estamos felizes em ter você conosco. 💚
        </p>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes drawCheck {
          0% { stroke-dasharray: 30; stroke-dashoffset: 30; opacity: 0; }
          40% { opacity: 1; }
          100% { stroke-dasharray: 30; stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 0.8; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
