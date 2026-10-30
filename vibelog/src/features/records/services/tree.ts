import type { NodeIndex, Filters } from "../schemas";
export function withAncestors(index: NodeIndex[], ids: string[]) {
  const byId = new Map(index.map((n) => [n.id, n]));
  const visible = new Set<string>();
  for (const id of ids) {
    let current: string | null = id;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (!byId.has(current)) break;
      visible.add(current);
      current = byId.get(current)!.pai_id;
    }
  }
  return [...visible];
}
export function filterRecords(index: NodeIndex[], f: Filters, searchMatches?: Set<string>) {
  return index
    .filter(
      (n) =>
        (!f.area.length || f.area.includes(n.area)) &&
        (!f.author || n.autor === f.author) &&
        (!f.type || n.tipo === f.type) &&
        (!f.branch || n.branch === f.branch) &&
        (!f.start || n.criado_em.slice(0, 10) >= f.start) &&
        (!f.end || n.criado_em.slice(0, 10) <= f.end) &&
        (!searchMatches || searchMatches.has(n.id)),
    )
    .map((n) => n.id);
}
export function safeUrl(url: string | null | undefined) {
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
