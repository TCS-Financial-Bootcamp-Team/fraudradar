import type { View, NodeSummary, NodeRecord, Evidence } from "../schemas";
export async function fetchRecords<T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`/api/records?${params}`, { signal, cache: "no-store" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Falha ao consultar registros.");
  return data;
}
export const getView = (params: string, signal?: AbortSignal) =>
  fetchRecords<View>(new URLSearchParams(`${params}&mode=view`), signal);
export async function getChildren(parent: string | null, signal?: AbortSignal) {
  const items: NodeSummary[] = [];
  for (let page = 0; ; page++) {
    const batch = await fetchRecords<NodeSummary[]>(
      new URLSearchParams({ mode: "children", parent: parent ?? "", page: String(page) }),
      signal,
    );
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}
export const getDetail = (id: string, signal?: AbortSignal) =>
  fetchRecords<{ node: NodeRecord; ancestors: NodeSummary[]; evidence: Evidence[] }>(
    new URLSearchParams({ mode: "detail", id }),
    signal,
  );
export const getList = (ids: string[], signal?: AbortSignal) =>
  fetchRecords<NodeSummary[]>(new URLSearchParams({ mode: "list", ids: ids.join(",") }), signal);
