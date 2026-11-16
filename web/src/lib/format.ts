import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";

// Os valores do SAML-D estão em libras (a API devolve moeda "GBP" nas movimentações).
// Toda formatação segue o idioma; sem idioma informado vale o padrão pt-BR.
export const formatCurrency = (
  amount: number,
  locale: AppLocale = DEFAULT_LOCALE,
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
export const formatNumber = (
  value: number,
  locale: AppLocale = DEFAULT_LOCALE,
) => new Intl.NumberFormat(locale).format(value);
export const formatDecimal = (
  value: number,
  maximumFractionDigits = 1,
  locale: AppLocale = DEFAULT_LOCALE,
) => new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
export const formatPercent = (
  value: number,
  locale: AppLocale = DEFAULT_LOCALE,
) =>
  new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
export const formatShortDate = (
  value: string,
  locale: AppLocale = DEFAULT_LOCALE,
) => new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(new Date(value));
export const formatDateTime = (
  value: string | number | Date,
  locale: AppLocale = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
) =>
  new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
    new Date(value),
  );

// Formatadores presos a um idioma, para os componentes (veja `useFormatters`).
export const createFormatters = (locale: AppLocale) => ({
  locale,
  currency: (amount: number) => formatCurrency(amount, locale),
  number: (value: number) => formatNumber(value, locale),
  decimal: (value: number, digits = 1) => formatDecimal(value, digits, locale),
  percent: (value: number) => formatPercent(value, locale),
  shortDate: (value: string) => formatShortDate(value, locale),
  dateTime: (
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions,
  ) => formatDateTime(value, locale, options),
});

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : getT("errors")("generic");
}

// Defesa adicional: a API também precisa pseudonimizar antes de chamar o LLM.
export function pseudonymize(
  content: string,
  accounts = new Map<string, string>(),
) {
  const identifierPattern =
    "(?=[A-Za-z0-9._-]*\\d)[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*";
  const referencePattern = new RegExp(
    `(?<!\\[)\\b(?:contas?|accounts?|sender_account|receiver_account|origem|destino|source|destination)(?:\\s+(?:de\\s+|of\\s+)?(?:origem|destino|source|destination))?\\s*["']?\\s*[:=]?\\s*["']?(${identifierPattern}(?:(?:\\s*[,;]\\s*|\\s+(?:e|and)\\s+)${identifierPattern})*)`,
    "gi",
  );
  const isAnalyticalValue = (id: string, start: number) =>
    /^R-\d+$/i.test(id) ||
    /^\d{4}-\d{2}-\d{2}$/.test(id) ||
    /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(id) ||
    /^\s*(?:horas?|dias?|semanas?|meses|minutos?|segundos?|hours?|days?|weeks?|months?|minutes?|seconds?|reais|BRL|USD|EUR|GBP|%)(?:\b|$)/i.test(
      content.slice(start + id.length),
    ) ||
    /(?:R\$|US\$|€)\s*$/.test(content.slice(0, start));
  const matches = [...content.matchAll(referencePattern)].flatMap((match) =>
    [...match[1].matchAll(new RegExp(identifierPattern, "g"))]
      .filter(
        (id) =>
          !isAnalyticalValue(
            id[0],
            match.index + match[0].lastIndexOf(match[1]) + id.index,
          ),
      )
      .map((id) => id[0]),
  );
  // Formatos inequívocos também são reconhecidos sem rótulo; números soltos são preservados.
  matches.push(
    ...(content.match(/\b(?:CTA-\d+|[A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/g) ?? []),
  );
  const usedAliases = new Set([
    ...accounts.values(),
    ...(content.match(/\[conta \d+\]/g) ?? []),
  ]);
  for (const account of matches) {
    if (accounts.has(account)) continue;
    let index = accounts.size + 1;
    while (usedAliases.has(`[conta ${index}]`)) index++;
    const alias = `[conta ${index}]`;
    accounts.set(account, alias);
    usedAliases.add(alias);
  }
  if (!accounts.size) return content;
  const escapedIds = [...accounts.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const tokenPattern = new RegExp(
    `\\[conta \\d+\\]|(?<![\\w-])(?<![\\w]\\.)(?:${escapedIds.join("|")})(?![\\w-]|\\.[\\w])`,
    "g",
  );
  return content.replace(tokenPattern, (id: string, start: number) =>
    isAnalyticalValue(id, start) ? id : (accounts.get(id) ?? id),
  );
}
