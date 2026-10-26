import { test } from "node:test";
import assert from "node:assert/strict";
import { organizarQuadro } from "../src/features/registros/services/quadro";
import type { Visao } from "../src/features/registros/schemas";

function visao(total: number): Visao {
  const indice = Array.from({ length: total }, (_, i) => ({
    id: `registro-${i}`,
    pai_id: i ? `registro-${Math.floor((i - 1) / 3)}` : null,
    tipo: i % 2 ? ("prompt_ia" as const) : ("resposta" as const),
    area: "frontend" as const,
    autor: "teste",
    branch: null,
    criado_em: "2026-10-26T12:00:00Z",
    titulo: `Registro ${i}`,
  }));
  return { indice, correspondencias: indice.map((n) => n.id), visiveis: indice.map((n) => n.id) };
}

test("quadro organiza 500 registros, recolhe subárvore e preserva ancestrais filtrados", () => {
  const dados = visao(500);
  const quadro = organizarQuadro(dados, new Set());
  assert.equal(quadro.nos.length, 500);
  assert.equal(quadro.arestas.length, 499);
  assert.ok(
    quadro.nos.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)),
  );
  assert.ok(quadro.arestas.some((a) => a.animated));

  const recolhido = organizarQuadro(dados, new Set(["registro-0"]));
  assert.deepEqual(
    recolhido.nos.map((n) => n.no.id),
    ["registro-0"],
  );
  const caminho: string[] = [];
  let id = "registro-499";
  while (id) {
    caminho.push(id);
    id = dados.indice.find((n) => n.id === id)?.pai_id ?? "";
  }
  const filtrada = organizarQuadro(
    { ...dados, correspondencias: ["registro-499"], visiveis: caminho },
    new Set(),
  );
  assert.equal(filtrada.nos.length, caminho.length);
  assert.equal(filtrada.nos.filter((n) => n.ancestral).length, caminho.length - 1);
  assert.equal(filtrada.nos.find((n) => n.no.id === "registro-499")?.ancestral, false);
});

test("referências cíclicas não bloqueiam o layout", () => {
  const dados = visao(2);
  dados.indice[0].pai_id = dados.indice[1].id;
  const quadro = organizarQuadro(dados, new Set());
  assert.equal(quadro.nos.length, 2);
  assert.equal(quadro.arestas.length, 0);
});
