// Os valores do SAML-D estão em libras (a API devolve moeda "GBP" nas movimentações).
export const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(valor);
export const numero = (valor: number) =>
  new Intl.NumberFormat("pt-BR").format(valor);
export const percentual = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(valor);
export const dataCurta = (valor: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(valor));
export function mensagemErro(erro: unknown) {
  return erro instanceof Error
    ? erro.message
    : "Não foi possível concluir. Tente novamente.";
}

// Defesa adicional: a API também precisa pseudonimizar antes de chamar o LLM.
export function pseudonimizar(
  texto: string,
  contas = new Map<string, string>(),
) {
  const identificador =
    "(?=[A-Za-z0-9._-]*\\d)[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*";
  const referencias = new RegExp(
    `(?<!\\[)\\b(?:contas?|sender_account|receiver_account|origem|destino)(?:\\s+(?:de\\s+)?(?:origem|destino))?\\s*["']?\\s*[:=]?\\s*["']?(${identificador}(?:(?:\\s*[,;]\\s*|\\s+e\\s+)${identificador})*)`,
    "gi",
  );
  const dadoAnalitico = (id: string, inicio: number) =>
    /^R-\d+$/i.test(id) ||
    /^\d{4}-\d{2}-\d{2}$/.test(id) ||
    /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(id) ||
    /^\s*(?:horas?|dias?|semanas?|meses|minutos?|segundos?|reais|BRL|USD|EUR|%)(?:\b|$)/i.test(
      texto.slice(inicio + id.length),
    ) ||
    /(?:R\$|US\$|€)\s*$/.test(texto.slice(0, inicio));
  const encontrados = [...texto.matchAll(referencias)].flatMap((m) =>
    [...m[1].matchAll(new RegExp(identificador, "g"))]
      .filter(
        (id) =>
          !dadoAnalitico(id[0], m.index + m[0].lastIndexOf(m[1]) + id.index),
      )
      .map((id) => id[0]),
  );
  // Formatos inequívocos também são reconhecidos sem rótulo; números soltos são preservados.
  encontrados.push(
    ...(texto.match(/\b(?:CTA-\d+|[A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/g) ?? []),
  );
  const usados = new Set([
    ...contas.values(),
    ...(texto.match(/\[conta \d+\]/g) ?? []),
  ]);
  for (const conta of encontrados) {
    if (contas.has(conta)) continue;
    let numero = contas.size + 1;
    while (usados.has(`[conta ${numero}]`)) numero++;
    const alias = `[conta ${numero}]`;
    contas.set(conta, alias);
    usados.add(alias);
  }
  if (!contas.size) return texto;
  const ids = [...contas.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const tokens = new RegExp(
    `\\[conta \\d+\\]|(?<![\\w-])(?<![\\w]\\.)(?:${ids.join("|")})(?![\\w-]|\\.[\\w])`,
    "g",
  );
  return texto.replace(tokens, (id: string, inicio: number) =>
    dadoAnalitico(id, inicio) ? id : (contas.get(id) ?? id),
  );
}
