"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { captureAttribution, loadAttribution } from "@/lib/attribution";
import { trackInitiateCheckoutWhenReady, trackPurchaseWhenReady } from "@/lib/checkoutTracking";

/* ─── Constants ─────────────────────────────────────────── */

const LOGO_URL =
  "https://s3.talitapaixao.com/typebot/public/workspaces/cmr6myovi00001dnqy3r2x68x/typebots/cmrbdsbgy00051dnqxuoll93l/blocks/jg1lo0122z7g4l6ort43kbqz?v=1783473154163";

const MAIN_PRODUCT = {
  id: "clipsaas-main",
  name: "ClipSaaS — Gerador de Legendas",
  price_cents: 3700,
};

const ORDER_BUMPS = [
  {
    id: "bump-whatsapp",
    emoji: "📱",
    name: "Suporte WhatsApp",
    description:
      "Suporte exclusivo via WhatsApp para tirar dúvidas e receber ajuda personalizada",
    price_cents: 990,
  },
  {
    id: "bump-updates",
    emoji: "🔄",
    name: "Atualizações Futuras",
    description:
      "Receba todas as atualizações e novas funcionalidades da ferramenta",
    price_cents: 1990,
  },
  {
    id: "bump-guide",
    emoji: "📚",
    name: "Guia Digital: Como Ganhar Dinheiro com Cortes Virais",
    description:
      "Aprenda estratégias comprovadas para monetizar com cortes virais nas redes sociais",
    price_cents: 2990,
  },
];

const PIX_TIMER_SECONDS = 300; // 5 minutes

/* ─── Helpers ───────────────────────────────────────────── */

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  return d.length === 11;
}

function isValidPhone(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 11;
}

/* ─── Styles (inline for standalone checkout) ───────────── */

const S = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
  } as React.CSSProperties,
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "0 16px 40px",
  } as React.CSSProperties,
  logoWrap: {
    display: "flex",
    justifyContent: "center",
    padding: "24px 0 12px",
  } as React.CSSProperties,
  logo: {
    height: 44,
    maxWidth: "100%",
    objectFit: "contain" as const,
  } as React.CSSProperties,
  stepper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    margin: "20px 0 28px",
  } as React.CSSProperties,
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: "24px 20px",
    marginBottom: 16,
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#52525b",
    marginBottom: 6,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 16,
    borderRadius: 12,
    border: "1px solid #d4d4d8",
    background: "#ffffff",
    color: "#18181b",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.2s",
  } as React.CSSProperties,
  inputFocus: {
    borderColor: "#facc15",
  } as React.CSSProperties,
  btn: {
    width: "100%",
    padding: "16px",
    fontSize: 16,
    fontWeight: 700,
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  } as React.CSSProperties,
  btnPrimary: {
    background: "#facc15",
    color: "#09090b",
  } as React.CSSProperties,
  btnDisabled: {
    background: "#e4e4e7",
    color: "#a1a1aa",
    cursor: "not-allowed",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center" as const,
    margin: "0 0 20px",
    color: "#18181b",
  } as React.CSSProperties,
  mainProduct: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#fffbeb",
    border: "1px solid #facc15",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 24,
  } as React.CSSProperties,
  bumpCard: (selected: boolean) =>
    ({
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      background: selected ? "#f0fdf4" : "#ffffff",
      border: `2px solid ${selected ? "#22c55e" : "#e5e7eb"}`,
      borderRadius: 14,
      padding: "18px 16px",
      marginBottom: 12,
      cursor: "pointer",
      transition: "all 0.25s ease",
      position: "relative" as const,
    }) as React.CSSProperties,
  bumpEmoji: {
    fontSize: 32,
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 2,
  } as React.CSSProperties,
  bumpContent: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  bumpName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#60a5fa",
    margin: "0 0 4px",
    lineHeight: 1.3,
  } as React.CSSProperties,
  bumpDesc: {
    fontSize: 13,
    color: "#52525b",
    margin: "0 0 10px",
    lineHeight: 1.5,
  } as React.CSSProperties,
  bumpFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } as React.CSSProperties,
  bumpPrice: {
    fontSize: 16,
    fontWeight: 800,
    color: "#ef4444",
  } as React.CSSProperties,
  bumpBtn: (selected: boolean) =>
    ({
      padding: "8px 16px",
      fontSize: 12,
      fontWeight: 600,
      border: "none",
      borderRadius: 20,
      cursor: "pointer",
      transition: "all 0.2s",
      whiteSpace: "nowrap" as const,
      background: selected ? "#22c55e" : "#1d4ed8",
      color: "#fff",
    }) as React.CSSProperties,
  totalBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f4f4f5",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 16,
    marginTop: 8,
  } as React.CSSProperties,
  totalLabel: {
    fontSize: 14,
    color: "#52525b",
  } as React.CSSProperties,
  totalValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#22c55e",
  } as React.CSSProperties,
  qrWrap: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 16,
    padding: "8px 0",
  } as React.CSSProperties,
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    background: "#fff",
    padding: 8,
  } as React.CSSProperties,
  pixCode: {
    width: "100%",
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "14px 16px",
    fontSize: 12,
    color: "#52525b",
    wordBreak: "break-all" as const,
    lineHeight: 1.5,
    maxHeight: 80,
    overflow: "hidden",
  } as React.CSSProperties,
  copyBtn: {
    width: "100%",
    padding: "14px",
    fontSize: 15,
    fontWeight: 700,
    border: "2px solid #22c55e",
    borderRadius: 12,
    cursor: "pointer",
    background: "transparent",
    color: "#22c55e",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  } as React.CSSProperties,
  timer: {
    textAlign: "center" as const,
    fontSize: 14,
    color: "#52525b",
  } as React.CSSProperties,
  timerValue: {
    fontSize: 32,
    fontWeight: 800,
    color: "#18181b",
    fontVariantNumeric: "tabular-nums",
  } as React.CSSProperties,
  progressBar: {
    width: "100%",
    height: 4,
    background: "#e5e7eb",
    borderRadius: 2,
    overflow: "hidden",
    margin: "8px 0",
  } as React.CSSProperties,
  progressFill: (pct: number) =>
    ({
      height: "100%",
      background:
        pct > 50 ? "#22c55e" : pct > 20 ? "#facc15" : "#ef4444",
      width: `${pct}%`,
      transition: "width 1s linear, background 0.5s",
      borderRadius: 2,
    }) as React.CSSProperties,
  errorMsg: {
    background: "#fef2f2",
    border: "1px solid #ef4444",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 13,
    color: "#b91c1c",
    marginBottom: 12,
    textAlign: "center" as const,
  } as React.CSSProperties,
  backBtn: {
    background: "none",
    border: "none",
    color: "#71717a",
    fontSize: 14,
    cursor: "pointer",
    padding: "8px 0",
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  } as React.CSSProperties,
  securityBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 16,
    paddingBottom: 20,
  } as React.CSSProperties,
};

/* ─── Stepper Component ─────────────────────────────────── */

function Stepper({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Dados" },
    { n: 2, label: "Ofertas" },
    { n: 3, label: "Pagamento" },
  ];
  return (
    <div style={S.stepper}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                transition: "all 0.3s",
                background:
                  s.n < current
                    ? "#22c55e"
                    : s.n === current
                      ? "#facc15"
                      : "#e4e4e7",
                color:
                  s.n <= current ? "#09090b" : "#a1a1aa",
              }}
            >
              {s.n < current ? "✓" : s.n}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: s.n === current ? "#ca8a04" : "#a1a1aa",
              }}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              style={{
                width: 48,
                height: 2,
                background: s.n < current ? "#22c55e" : "#e4e4e7",
                margin: "0 8px",
                marginBottom: 20,
                borderRadius: 1,
                transition: "background 0.3s",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Checkout Component ───────────────────────────── */

export default function CheckoutPage() {
  const [step, setStep] = useState(1);
  const [focusedField, setFocusedField] = useState("");

  // Step 1: Personal data
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");

  // Step 2: Order bumps
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(new Set());

  // Step 3: PIX
  const [cpf, setCPF] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pixData, setPixData] = useState<{
    qrCodeImage: string;
    brCode: string;
    correlationID: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(PIX_TIMER_SECONDS);
  const [copied, setCopied] = useState(false);
  const [pixExpired, setPixExpired] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    captureAttribution();
  }, []);

  /* ─ Calculate total ─ */
  const bumpTotal = ORDER_BUMPS.filter((b) => selectedBumps.has(b.id)).reduce(
    (sum, b) => sum + b.price_cents,
    0
  );
  const totalCents = MAIN_PRODUCT.price_cents + bumpTotal;

  /* ─ Validation ─ */
  const step1Valid =
    name.trim().length >= 3 &&
    isValidPhone(whatsapp) &&
    isValidEmail(email);

  const step3Valid = isValidCPF(cpf);

  /* ─ Toggle bump ─ */
  const toggleBump = (id: string) => {
    setSelectedBumps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ─ Build items list ─ */
  const buildItems = () => {
    const items = [
      {
        id: MAIN_PRODUCT.id,
        name: MAIN_PRODUCT.name,
        price_cents: MAIN_PRODUCT.price_cents,
      },
    ];
    for (const bump of ORDER_BUMPS) {
      if (selectedBumps.has(bump.id)) {
        items.push({
          id: bump.id,
          name: bump.name,
          price_cents: bump.price_cents,
        });
      }
    }
    return items;
  };

  /* ─ Cleanup on unmount ─ */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  /* ─ Start polling ─ */
  const startPolling = useCallback((correlationID: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/checkout/status/${correlationID}`);
        const data = await res.json();
        if (data.status === "COMPLETED") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          trackPurchaseWhenReady({ transactionId: correlationID, valueCents: totalCents });
          window.location.href = `/checkout/confirmacao?v=${totalCents}&tid=${encodeURIComponent(correlationID)}`;
        }
      } catch {
        // silently retry
      }
    }, 3000);
  }, [totalCents]);

  /* ─ Start countdown ─ */
  const startTimer = useCallback(() => {
    setSecondsLeft(PIX_TIMER_SECONDS);
    setPixExpired(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
          setPixExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  /* ─ Generate PIX ─ */
  const handleGeneratePIX = async () => {
    setError("");
    setLoading(true);
    setCopied(false);
    setPixData(null);

    try {
      const attribution = loadAttribution();
      const res = await fetch("/api/checkout/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          whatsapp: whatsapp,
          cpf: cpf,
          items: buildItems(),
          total_cents: totalCents,
          ...attribution,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.detail || errData.error || "Erro ao gerar cobrança PIX"
        );
      }

      const data = await res.json();
      setPixData({
        qrCodeImage: data.qrCodeImage,
        brCode: data.brCode,
        correlationID: data.correlationID,
      });
      sessionStorage.setItem("checkout_tid", data.correlationID);
      trackInitiateCheckoutWhenReady(totalCents);
      startTimer();
      startPolling(data.correlationID);
    } catch (err: any) {
      setError(err.message || "Erro ao gerar PIX. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  /* ─ Copy PIX code ─ */
  const handleCopy = async () => {
    if (!pixData?.brCode) return;
    try {
      await navigator.clipboard.writeText(pixData.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = pixData.brCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  /* ─ Format timer ─ */
  const timerMinutes = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0");
  const timerSeconds = (secondsLeft % 60).toString().padStart(2, "0");
  const timerPct = (secondsLeft / PIX_TIMER_SECONDS) * 100;

  /* ─── Render ──────────────────────────────────────────── */

  return (
    <div style={S.page}>
      <div style={S.container}>
        {/* Logo */}
        <div style={S.logoWrap}>
          <img src={LOGO_URL} alt="ClipSaaS" style={S.logo} draggable={false} />
        </div>

        {/* Stepper */}
        <Stepper current={step} />

        {/* Main Product Badge */}
        <div style={S.mainProduct}>
          <div>
            <div style={{ fontSize: 11, color: "#facc15", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
              Produto principal
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
              {MAIN_PRODUCT.name}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e", whiteSpace: "nowrap" }}>
            {formatBRL(MAIN_PRODUCT.price_cents)}
          </div>
        </div>

        {/* ══════════ STEP 1 ══════════ */}
        {step === 1 && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={S.card}>
              <h2 style={{ ...S.sectionTitle, marginBottom: 24 }}>
                Preencha seus dados
              </h2>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Nome completo</label>
                <input
                  type="text"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField("")}
                  style={{
                    ...S.input,
                    ...(focusedField === "name" ? S.inputFocus : {}),
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>WhatsApp</label>
                <input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                  onFocus={() => setFocusedField("phone")}
                  onBlur={() => setFocusedField("")}
                  style={{
                    ...S.input,
                    ...(focusedField === "phone" ? S.inputFocus : {}),
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={S.label}>E-mail</label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField("")}
                  style={{
                    ...S.input,
                    ...(focusedField === "email" ? S.inputFocus : {}),
                  }}
                />
              </div>

              <button
                onClick={() => step1Valid && setStep(2)}
                disabled={!step1Valid}
                style={{
                  ...S.btn,
                  ...(step1Valid ? S.btnPrimary : S.btnDisabled),
                }}
              >
                Continuar →
              </button>
            </div>

            <div style={S.securityBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Seus dados estão seguros e protegidos
            </div>
          </div>
        )}

        {/* ══════════ STEP 2 ══════════ */}
        {step === 2 && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <button onClick={() => setStep(1)} style={S.backBtn}>
              ← Voltar
            </button>

            <h2 style={S.sectionTitle}>Aproveite essas ofertas especiais!</h2>

            {ORDER_BUMPS.map((bump) => {
              const selected = selectedBumps.has(bump.id);
              return (
                <div
                  key={bump.id}
                  onClick={() => toggleBump(bump.id)}
                  style={S.bumpCard(selected)}
                >
                  <div style={S.bumpEmoji}>{bump.emoji}</div>
                  <div style={S.bumpContent}>
                    <p style={S.bumpName}>{bump.name}</p>
                    <p style={S.bumpDesc}>{bump.description}</p>
                    <div style={S.bumpFooter}>
                      <span style={S.bumpPrice}>
                        {formatBRL(bump.price_cents)}
                      </span>
                      <span style={S.bumpBtn(selected)}>
                        {selected ? "Adicionado ✓" : "Adicionar oferta"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Total */}
            <div style={S.totalBar}>
              <span style={S.totalLabel}>Total</span>
              <span style={S.totalValue}>{formatBRL(totalCents)}</span>
            </div>

            <button
              onClick={() => setStep(3)}
              style={{ ...S.btn, ...S.btnPrimary }}
            >
              Continuar para pagamento →
            </button>

            <div style={S.securityBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Pagamento 100% seguro via PIX
            </div>
          </div>
        )}

        {/* ══════════ STEP 3 ══════════ */}
        {step === 3 && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <button
              onClick={() => {
                if (!pixData) setStep(2);
              }}
              style={{
                ...S.backBtn,
                ...(pixData ? { opacity: 0.3, cursor: "default" } : {}),
              }}
            >
              ← Voltar
            </button>

            <div style={S.card}>
              {!pixData ? (
                <>
                  <h2 style={{ ...S.sectionTitle, marginBottom: 8 }}>
                    Pagamento via PIX
                  </h2>
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      color: "#52525b",
                      marginBottom: 24,
                    }}
                  >
                    Insira seu CPF para gerar o código PIX
                  </p>

                  {error && <div style={S.errorMsg}>{error}</div>}

                  <div style={{ marginBottom: 20 }}>
                    <label style={S.label}>CPF</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => setCPF(maskCPF(e.target.value))}
                      onFocus={() => setFocusedField("cpf")}
                      onBlur={() => setFocusedField("")}
                      style={{
                        ...S.input,
                        ...(focusedField === "cpf" ? S.inputFocus : {}),
                      }}
                    />
                  </div>

                  {/* Total reminder */}
                  <div style={S.totalBar}>
                    <span style={S.totalLabel}>Total a pagar</span>
                    <span style={S.totalValue}>{formatBRL(totalCents)}</span>
                  </div>

                  <button
                    onClick={handleGeneratePIX}
                    disabled={!step3Valid || loading}
                    style={{
                      ...S.btn,
                      ...(step3Valid && !loading
                        ? { background: "#22c55e", color: "#fff" }
                        : S.btnDisabled),
                    }}
                  >
                    {loading ? (
                      <>
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            border: "2px solid #fff4",
                            borderTopColor: "#fff",
                            borderRadius: "50%",
                            display: "inline-block",
                            animation: "spin 0.8s linear infinite",
                          }}
                        />
                        Gerando PIX...
                      </>
                    ) : (
                      "Gerar PIX"
                    )}
                  </button>
                </>
              ) : pixExpired ? (
                <>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 48,
                        marginBottom: 12,
                      }}
                    >
                      ⏰
                    </div>
                    <h2 style={{ ...S.sectionTitle, color: "#ef4444" }}>
                      PIX expirado
                    </h2>
                    <p
                      style={{
                        fontSize: 14,
                        color: "#52525b",
                        marginBottom: 24,
                      }}
                    >
                      O tempo para pagamento expirou. Gere um novo código PIX.
                    </p>
                    <button
                      onClick={() => {
                        setPixData(null);
                        setPixExpired(false);
                        setError("");
                      }}
                      style={{
                        ...S.btn,
                        background: "#22c55e",
                        color: "#fff",
                      }}
                    >
                      Gerar novo PIX
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* QR Code and PIX code */}
                  <div style={S.qrWrap}>
                    <h2 style={{ ...S.sectionTitle, marginBottom: 4 }}>
                      Escaneie o QR Code
                    </h2>
                    <p
                      style={{
                        textAlign: "center",
                        fontSize: 13,
                        color: "#52525b",
                        margin: "0 0 12px",
                      }}
                    >
                      ou copie o código PIX abaixo
                    </p>

                    {/* QR Code */}
                    <img
                      src={pixData.qrCodeImage}
                      alt="QR Code PIX"
                      style={S.qrImage}
                    />

                    {/* Timer */}
                    <div style={S.timer}>
                      <div>Pague em até</div>
                      <div style={S.timerValue}>
                        {timerMinutes}:{timerSeconds}
                      </div>
                      <div style={S.progressBar}>
                        <div style={S.progressFill(timerPct)} />
                      </div>
                    </div>

                    {/* PIX Copia e Cola */}
                    <div style={{ width: "100%" }}>
                      <label
                        style={{
                          ...S.label,
                          marginBottom: 8,
                          textAlign: "center",
                          display: "block",
                        }}
                      >
                        PIX Copia e Cola
                      </label>
                      <div style={S.pixCode}>{pixData.brCode}</div>
                    </div>

                    <button onClick={handleCopy} style={S.copyBtn}>
                      {copied ? (
                        <>✓ Código copiado!</>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          Copiar código PIX
                        </>
                      )}
                    </button>

                    {/* Total reminder */}
                    <div style={{ ...S.totalBar, width: "100%" }}>
                      <span style={S.totalLabel}>Valor</span>
                      <span style={S.totalValue}>{formatBRL(totalCents)}</span>
                    </div>

                    <p
                      style={{
                        textAlign: "center",
                        fontSize: 12,
                        color: "#52525b",
                        lineHeight: 1.6,
                      }}
                    >
                      Após o pagamento, seu acesso será liberado automaticamente
                      e os dados de login serão enviados para{" "}
                      <strong style={{ color: "#18181b" }}>{email}</strong>
                    </p>
                  </div>
                </>
              )}
            </div>

            <div style={S.securityBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Pagamento processado pela OpenPix • 100% seguro
            </div>
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input::placeholder {
          color: #a1a1aa;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
