/** Rotating status lines shown during IA clip detection. */
export const CLIP_DETECT_STEPS = [
  "Lendo transcrição do vídeo…",
  "Detectando cenas com potencial viral…",
  "Identificando ganchos impactantes…",
  "Buscando cold opens chamativos…",
  "Montando trechos completos (gancho + contexto)…",
  "Gerando cortes sugeridos…",
  "Refinando início e fim de cada trecho…",
  "Selecionando os melhores momentos…",
  "Quase pronto — finalizando análise…",
] as const;

export function clipDetectProgressPct(elapsedMs: number, maxMs = 900_000): number {
  const t = Math.min(1, elapsedMs / maxMs);
  // Ease-out: rápido no início, desacelera perto de 92%
  return Math.min(92, Math.round((1 - Math.pow(1 - t, 2.2)) * 92));
}
