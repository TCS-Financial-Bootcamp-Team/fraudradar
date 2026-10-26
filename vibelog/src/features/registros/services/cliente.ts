import type { Visao, Resumo, No, Evidencia } from "../schemas";
export async function consultar<T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`/api/registros?${params}`, { signal, cache: "no-store" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.erro ?? "Falha ao consultar registros.");
  return data;
}
export const obterVisao = (params: string, signal?: AbortSignal) =>
  consultar<Visao>(new URLSearchParams(`${params}&modo=visao`), signal);
export async function obterFilhos(pai: string | null, signal?: AbortSignal) {
  const lista: Resumo[] = [];
  for (let pagina = 0; ; pagina++) {
    const lote = await consultar<Resumo[]>(
      new URLSearchParams({ modo: "filhos", pai: pai ?? "", pagina: String(pagina) }),
      signal,
    );
    lista.push(...lote);
    if (lote.length < 100) return lista;
  }
}
export const obterDetalhe = (id: string, signal?: AbortSignal) =>
  consultar<{ no: No; ancestrais: Resumo[]; evidencias: Evidencia[] }>(
    new URLSearchParams({ modo: "detalhe", id }),
    signal,
  );
export const obterLista = (ids: string[], signal?: AbortSignal) =>
  consultar<Resumo[]>(new URLSearchParams({ modo: "lista", ids: ids.join(",") }), signal);
