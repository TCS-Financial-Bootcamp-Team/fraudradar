import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comAncestrais,
  filtrar,
  repoUrl,
  urlSegura,
} from "../src/features/registros/services/arvore";
import { lerFiltros, type Indice } from "../src/features/registros/schemas";
const indice: Indice[] = [
  {
    id: "raiz",
    pai_id: null,
    tipo: "prompt_humano",
    area: "infra",
    autor: "pedro",
    branch: null,
    criado_em: "2026-10-25T10:00:00Z",
  },
  {
    id: "delegacao",
    pai_id: "raiz",
    tipo: "prompt_ia",
    area: "backend",
    autor: "claude",
    branch: "feat/api",
    criado_em: "2026-10-26T10:00:00Z",
  },
  {
    id: "resultado",
    pai_id: "delegacao",
    tipo: "resposta",
    area: "ml",
    autor: "codex",
    branch: "feat/ml",
    criado_em: "2026-10-26T23:59:59Z",
  },
  {
    id: "outra",
    pai_id: null,
    tipo: "marco",
    area: "docs",
    autor: "claude",
    branch: null,
    criado_em: "2026-10-27T00:00:00Z",
  },
];
test("filtro profundo mantém todos os ancestrais, inclusive de outras áreas", () => {
  const ids = filtrar(
    indice,
    lerFiltros(new URLSearchParams("area=ml&area=ia&autor=codex&fim=2026-10-26")),
  );
  assert.deepEqual(ids, ["resultado"]);
  assert.deepEqual(
    new Set(comAncestrais(indice, ids)),
    new Set(["resultado", "delegacao", "raiz"]),
  );
});
test("busca e filtros se intersectam e fim inclui o dia inteiro", () => {
  assert.deepEqual(
    filtrar(
      indice,
      lerFiltros(new URLSearchParams("inicio=2026-10-26&fim=2026-10-26&branch=feat%2Fml")),
      new Set(["resultado"]),
    ),
    ["resultado"],
  );
  assert.deepEqual(
    filtrar(indice, lerFiltros(new URLSearchParams("area=backend")), new Set(["resultado"])),
    [],
  );
});
test("ciclos no índice não travam a árvore", () => {
  assert.deepEqual(comAncestrais([{ ...indice[0], pai_id: "raiz" }], ["raiz"]), ["raiz"]);
});
test("links de metadados rejeitam javascript e repositórios externos", () => {
  assert.equal(urlSegura("javascript:alert(1)"), null);
  assert.equal(repoUrl("https://evil.test/a/b"), null);
  assert.equal(repoUrl("time/repo"), "https://github.com/time/repo");
});
