export const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
export function pseudonimizar(texto: string) {
  return texto.replace(
    /\b(?=[A-Za-z0-9.-]*\d)[A-Za-z0-9][A-Za-z0-9.-]*\b/g,
    "[identificador protegido]",
  );
}
