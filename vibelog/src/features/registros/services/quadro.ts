import { graphlib, layout } from "@dagrejs/dagre";
import type { Visao } from "../schemas";

export function organizarQuadro(
  visao: Visao,
  recolhidos: ReadonlySet<string>,
  apresentacao = false,
) {
  const mapa = new Map(visao.indice.map((no) => [no.id, no]));
  const visiveis = new Set(visao.visiveis);
  const nos = visao.indice.filter((no) => {
    if (!visiveis.has(no.id)) return false;
    let pai = no.pai_id;
    const vistos = new Set([no.id]);
    while (pai && !vistos.has(pai)) {
      if (recolhidos.has(pai)) return false;
      vistos.add(pai);
      pai = mapa.get(pai)?.pai_id ?? null;
    }
    return true;
  });
  const ids = new Set(nos.map((no) => no.id));
  const largura = apresentacao ? 340 : 264;
  const altura = apresentacao ? 184 : 148;
  const grafo = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  grafo.setGraph({ rankdir: "TB", nodesep: 32, ranksep: 64, marginx: 24, marginy: 24 });
  nos.forEach((no) => grafo.setNode(no.id, { width: largura, height: altura }));
  // Ignora ciclos de dados malformados; um registro continua consultável como raiz.
  const pais = new Map<string, string>();
  for (const no of nos) {
    if (!no.pai_id || !ids.has(no.pai_id)) continue;
    let pai: string | null = no.pai_id;
    const vistos = new Set([no.id]);
    while (pai && !vistos.has(pai)) {
      vistos.add(pai);
      pai = mapa.get(pai)?.pai_id ?? null;
    }
    if (pai) continue;
    pais.set(no.id, no.pai_id);
    grafo.setEdge(no.pai_id, no.id);
  }
  layout(grafo);
  const filhos = new Map<string, number>();
  visao.indice.forEach((no) => {
    if (no.pai_id && visiveis.has(no.id)) filhos.set(no.pai_id, (filhos.get(no.pai_id) ?? 0) + 1);
  });
  const correspondencias = new Set(visao.correspondencias);
  return {
    nos: nos.map((no) => ({
      no,
      position: { x: grafo.node(no.id).x - largura / 2, y: grafo.node(no.id).y - altura / 2 },
      largura,
      altura,
      ancestral: !correspondencias.has(no.id),
      filhos: filhos.get(no.id) ?? 0,
    })),
    arestas: [...pais].map(([filho, pai]) => ({
      id: `${pai}-${filho}`,
      source: pai,
      target: filho,
      type: "smoothstep",
      animated: mapa.get(filho)?.tipo === "prompt_ia",
    })),
  };
}
