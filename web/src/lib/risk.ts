// Nota de risco do modelo (0 a 100). Ela ordena a fila: o modelo não é calibrado, então
// 87 não quer dizer 87% de chance de ser lavagem. Toda conta na fila já passou do corte
// do modelo, por isso não existe faixa "baixa" para um alerta: a menor é "moderada".
export type RiskLevel = "critical" | "high" | "medium";

export const RISK_LABELS: Record<RiskLevel, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Moderado",
};

export const SCORE_HINT =
  "Ordena a fila: não é a chance de ser lavagem. Quem desempata é a posição na fila.";

export function riskLevel(score: number): RiskLevel {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  return "medium";
}

export const formatScore = (score: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);

export const formatQueuePosition = (position: number) => `${position}º na fila`;
