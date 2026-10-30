import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withAncestors,
  filterRecords,
  repoUrl,
  safeUrl,
} from "../src/features/records/services/tree";
import { parseFilters, type NodeIndex } from "../src/features/records/schemas";
const index: NodeIndex[] = [
  {
    id: "root",
    pai_id: null,
    tipo: "prompt_humano",
    area: "infra",
    autor: "pedro",
    branch: null,
    criado_em: "2026-10-25T10:00:00Z",
  },
  {
    id: "delegation",
    pai_id: "root",
    tipo: "prompt_ia",
    area: "backend",
    autor: "claude",
    branch: "feat/api",
    criado_em: "2026-10-26T10:00:00Z",
  },
  {
    id: "reply",
    pai_id: "delegation",
    tipo: "resposta",
    area: "ml",
    autor: "codex",
    branch: "feat/ml",
    criado_em: "2026-10-26T23:59:59Z",
  },
  {
    id: "other",
    pai_id: null,
    tipo: "marco",
    area: "docs",
    autor: "claude",
    branch: null,
    criado_em: "2026-10-27T00:00:00Z",
  },
];
test("filtro profundo mantém todos os ancestrais, inclusive de outras áreas", () => {
  const ids = filterRecords(
    index,
    parseFilters(new URLSearchParams("area=ml&area=ia&author=codex&end=2026-10-26")),
  );
  assert.deepEqual(ids, ["reply"]);
  assert.deepEqual(new Set(withAncestors(index, ids)), new Set(["reply", "delegation", "root"]));
});
test("busca e filtros se intersectam e fim inclui o dia inteiro", () => {
  assert.deepEqual(
    filterRecords(
      index,
      parseFilters(new URLSearchParams("start=2026-10-26&end=2026-10-26&branch=feat%2Fml")),
      new Set(["reply"]),
    ),
    ["reply"],
  );
  assert.deepEqual(
    filterRecords(index, parseFilters(new URLSearchParams("area=backend")), new Set(["reply"])),
    [],
  );
});
test("ciclos no índice não travam a árvore", () => {
  assert.deepEqual(withAncestors([{ ...index[0], pai_id: "root" }], ["root"]), ["root"]);
});
test("links de metadados rejeitam javascript e repositórios externos", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(repoUrl("https://evil.test/a/b"), null);
  assert.equal(repoUrl("time/repo"), "https://github.com/time/repo");
});
