import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBoard } from "../src/features/records/services/board";
import type { View } from "../src/features/records/schemas";

function buildView(total: number): View {
  const index = Array.from({ length: total }, (_, i) => ({
    id: `record-${i}`,
    pai_id: i ? `record-${Math.floor((i - 1) / 3)}` : null,
    tipo: i % 2 ? ("prompt_ia" as const) : ("resposta" as const),
    area: "frontend" as const,
    autor: "test",
    branch: null,
    criado_em: "2026-10-26T12:00:00Z",
    titulo: `Registro ${i}`,
  }));
  return { index, matches: index.map((n) => n.id), visible: index.map((n) => n.id) };
}

test("quadro organiza 500 registros, recolhe subárvore e preserva ancestrais filtrados", () => {
  const view = buildView(500);
  const board = layoutBoard(view, new Set());
  assert.equal(board.nodes.length, 500);
  assert.equal(board.edges.length, 499);
  assert.ok(
    board.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)),
  );
  assert.ok(board.edges.some((a) => a.animated));

  const collapsed = layoutBoard(view, new Set(["record-0"]));
  assert.deepEqual(
    collapsed.nodes.map((n) => n.node.id),
    ["record-0"],
  );
  const trail: string[] = [];
  let id = "record-499";
  while (id) {
    trail.push(id);
    id = view.index.find((n) => n.id === id)?.pai_id ?? "";
  }
  const filtered = layoutBoard({ ...view, matches: ["record-499"], visible: trail }, new Set());
  assert.equal(filtered.nodes.length, trail.length);
  assert.equal(filtered.nodes.filter((n) => n.ancestor).length, trail.length - 1);
  assert.equal(filtered.nodes.find((n) => n.node.id === "record-499")?.ancestor, false);
});

test("referências cíclicas não bloqueiam o layout", () => {
  const view = buildView(2);
  view.index[0].pai_id = view.index[1].id;
  const board = layoutBoard(view, new Set());
  assert.equal(board.nodes.length, 2);
  assert.equal(board.edges.length, 0);
});
