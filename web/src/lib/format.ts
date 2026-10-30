// Os valores do SAML-D estão em libras (a API devolve moeda "GBP" nas movimentações).
export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
export const formatNumber = (value: number) =>
  new Intl.NumberFormat("pt-BR").format(value);
export const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
export const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
export function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
}

// Defesa adicional: a API também precisa pseudonimizar antes de chamar o LLM.
export function pseudonymize(
  content: string,
  accounts = new Map<string, string>(),
) {
  const identifierPattern =
    "(?=[A-Za-z0-9._-]*\\d)[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*";
  const referencePattern = new RegExp(
    `(?<!\\[)\\b(?:contas?|sender_account|receiver_account|origem|destino)(?:\\s+(?:de\\s+)?(?:origem|destino))?\\s*["']?\\s*[:=]?\\s*["']?(${identifierPattern}(?:(?:\\s*[,;]\\s*|\\s+e\\s+)${identifierPattern})*)`,
    "gi",
  );
  const isAnalyticalValue = (id: string, start: number) =>
    /^R-\d+$/i.test(id) ||
    /^\d{4}-\d{2}-\d{2}$/.test(id) ||
    /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(id) ||
    /^\s*(?:horas?|dias?|semanas?|meses|minutos?|segundos?|reais|BRL|USD|EUR|%)(?:\b|$)/i.test(
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
