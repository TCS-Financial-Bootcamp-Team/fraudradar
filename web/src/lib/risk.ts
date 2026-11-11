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

export const isHighRisk = (score: number): boolean => score >= 98;

export const formatScore = (score: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);

export const formatQueuePosition = (position: number) => `${position}º na fila`;

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function formatWeekLabel(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parts[0];
    const month = parseInt(parts[1], 10) - 1;
    const day = parts[2].padStart(2, "0");
    if (month >= 0 && month < 12) {
      return `${day} ${MONTHS_PT[month]} ${year}`;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_PT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDayMonth(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length >= 3) {
    const month = parseInt(parts[1], 10) - 1;
    const day = parts[2].slice(0, 2).padStart(2, "0");
    if (month >= 0 && month < 12) {
      return `${day} ${MONTHS_PT[month]}`;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_PT[d.getUTCMonth()]}`;
}

export function formatAlertPlural(count: number): string {
  return count === 1 ? "1 alerta encontrado" : `${count} alertas encontrados`;
}
