import type { Indice, Filtros } from "../schemas";
export function comAncestrais(indice: Indice[], ids: string[]) {
  const mapa = new Map(indice.map((n) => [n.id, n]));
  const visiveis = new Set<string>();
  for (const id of ids) {
    let atual: string | null = id;
    const visitados = new Set<string>();
    while (atual && !visitados.has(atual)) {
      visitados.add(atual);
      if (!mapa.has(atual)) break;
      visiveis.add(atual);
      atual = mapa.get(atual)!.pai_id;
    }
  }
  return [...visiveis];
}
export function filtrar(indice: Indice[], f: Filtros, busca?: Set<string>) {
  return indice
    .filter(
      (n) =>
        (!f.area.length || f.area.includes(n.area)) &&
        (!f.autor || n.autor === f.autor) &&
        (!f.tipo || n.tipo === f.tipo) &&
        (!f.branch || n.branch === f.branch) &&
        (!f.inicio || n.criado_em.slice(0, 10) >= f.inicio) &&
        (!f.fim || n.criado_em.slice(0, 10) <= f.fim) &&
        (!busca || busca.has(n.id)),
    )
    .map((n) => n.id);
}
export function urlSegura(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function repoUrl(repo: unknown) {
  if (typeof repo !== "string") return null;
  const slug = repo
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  return /^[\w.-]+\/[\w.-]+$/.test(slug) ? `https://github.com/${slug}` : null;
}
