import { graphlib, layout } from "@dagrejs/dagre";
import type { View } from "../schemas";

export function layoutBoard(view: View, collapsed: ReadonlySet<string>, presentation = false) {
  const byId = new Map(view.index.map((item) => [item.id, item]));
  const visible = new Set(view.visible);
  const items = view.index.filter((item) => {
    if (!visible.has(item.id)) return false;
    let parentId = item.pai_id;
    const visited = new Set([item.id]);
    while (parentId && !visited.has(parentId)) {
      if (collapsed.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId)?.pai_id ?? null;
    }
    return true;
  });
  const ids = new Set(items.map((item) => item.id));
  const width = presentation ? 340 : 264;
  const height = presentation ? 184 : 148;
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 32, ranksep: 64, marginx: 24, marginy: 24 });
  items.forEach((item) => graph.setNode(item.id, { width, height }));
  // Ignora ciclos de dados malformados; um registro continua consultável como raiz.
  const parents = new Map<string, string>();
  for (const item of items) {
    if (!item.pai_id || !ids.has(item.pai_id)) continue;
    let parentId: string | null = item.pai_id;
    const visited = new Set([item.id]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      parentId = byId.get(parentId)?.pai_id ?? null;
    }
    if (parentId) continue;
    parents.set(item.id, item.pai_id);
    graph.setEdge(item.pai_id, item.id);
  }
  layout(graph);
  const childCounts = new Map<string, number>();
  view.index.forEach((item) => {
    if (item.pai_id && visible.has(item.id))
      childCounts.set(item.pai_id, (childCounts.get(item.pai_id) ?? 0) + 1);
  });
  const matches = new Set(view.matches);
  return {
    nodes: items.map((item) => ({
      node: item,
      position: {
        x: graph.node(item.id).x - width / 2,
        y: graph.node(item.id).y - height / 2,
      },
      width,
      height,
      ancestor: !matches.has(item.id),
      children: childCounts.get(item.id) ?? 0,
    })),
    edges: [...parents].map(([childId, parentId]) => ({
      id: `${parentId}-${childId}`,
      source: parentId,
      target: childId,
      type: "smoothstep",
      animated: byId.get(childId)?.tipo === "prompt_ia",
    })),
  };
}
