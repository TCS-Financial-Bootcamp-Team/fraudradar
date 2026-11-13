import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";

// Nota de risco do modelo (0 a 100). Ela ordena a fila: o modelo não é calibrado, então
// 87 não quer dizer 87% de chance de ser lavagem. Toda conta na fila já passou do corte
// do modelo, por isso não existe faixa "baixa" para um alerta: a menor é "moderada".
export type RiskLevel = "critical" | "high" | "medium";

export const RISK_LEVELS: RiskLevel[] = ["critical", "high", "medium"];

// Rótulo da faixa no idioma pedido (padrão pt-BR).
export const riskLabel = (level: RiskLevel, locale: AppLocale = DEFAULT_LOCALE) =>
  getT("alerts.risk", locale)(level);

// Rótulos em pt-BR, o idioma padrão.
export const RISK_LABELS: Record<RiskLevel, string> = {
  critical: riskLabel("critical"),
  high: riskLabel("high"),
  medium: riskLabel("medium"),
};

export const scoreHint = (locale: AppLocale = DEFAULT_LOCALE) =>
  getT("alerts.risk", locale)("scoreHint");

export function riskLevel(score: number): RiskLevel {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  return "medium";
}

export const isHighRisk = (score: number): boolean => score >= 98;

export const formatScore = (score: number, locale: AppLocale = DEFAULT_LOCALE) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);

export const formatQueuePosition = (
  position: number,
  locale: AppLocale = DEFAULT_LOCALE,
) => getT("alerts.risk", locale)("queuePosition", { position });

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

// Entende "AAAA-MM-DD" (e "AAAA-MM-DDThh:mm...") ou qualquer data que o Date aceite, em UTC.
function dateParts(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (match) {
    const month = parseInt(match[2], 10) - 1;
    if (month >= 0 && month < 12) {
      return { year: match[1], month, day: match[3] };
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return {
    year: String(d.getUTCFullYear()),
    month: d.getUTCMonth(),
    day: String(d.getUTCDate()).padStart(2, "0"),
  };
}

// "19 out 2026" em pt-BR; "Oct 19, 2026" em inglês.
export function formatWeekLabel(
  dateStr: string,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  if (!dateStr) return "";
  const parts = dateParts(dateStr);
  if (!parts) return dateStr;
  const t = getT("common.date", locale);
  return t("weekLabel", {
    day: parts.day,
    month: t(`monthsShort.${MONTH_KEYS[parts.month]}`),
    year: parts.year,
  });
}

// "19 out" em pt-BR; "Oct 19" em inglês.
export function formatDayMonth(
  dateStr: string,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  if (!dateStr) return "";
  const parts = dateParts(dateStr);
  if (!parts) return dateStr;
  const t = getT("common.date", locale);
  return t("dayMonth", {
    day: parts.day,
    month: t(`monthsShort.${MONTH_KEYS[parts.month]}`),
  });
}

export function formatAlertPlural(
  count: number,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  return getT("alerts.risk", locale)("alertsFound", { count });
}
