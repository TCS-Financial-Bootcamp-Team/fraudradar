import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiDelete,
  apiGet,
  errorMessageFor,
} from "../src/lib/api";

const generic = "Não foi possível concluir a solicitação (409). Tente novamente.";

test("o detail em texto da API vira a mensagem; outros formatos caem no texto genérico", () => {
  assert.equal(
    errorMessageFor(409, { detail: "A conexão já está em uso." }, generic),
    "A conexão já está em uso.",
  );
  // 422 do Pydantic: lista de erros, não texto para a tela.
  assert.equal(
    errorMessageFor(422, { detail: [{ type: "x", loc: [], msg: "y" }] }, generic),
    generic,
  );
  assert.equal(errorMessageFor(500, { detail: "  " }, generic), generic);
  assert.equal(errorMessageFor(500, null, generic), generic);
  assert.equal(errorMessageFor(500, "texto", generic), generic);
  assert.equal(
    errorMessageFor(401, { detail: "Not authenticated" }, generic),
    "Sua sessão expirou. Entre novamente.",
  );
});

test("requisições JSON mostram o detail da API e aceitam 204 no DELETE", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (String(input).endsWith("/busy"))
      return Response.json(
        { detail: "A importação desta conexão está em andamento." },
        { status: 409 },
      );
    if (String(input).endsWith("/html"))
      return new Response("<html>", { status: 502 });
    return new Response(null, { status: 204 });
  };
  try {
    await assert.rejects(() => apiGet("/busy"), {
      message: "A importação desta conexão está em andamento.",
    });
    await assert.rejects(() => apiGet("/html"), /\(502\)/);
    assert.equal(await apiDelete("/ingestion/connections/3"), undefined);
  } finally {
    globalThis.fetch = original;
  }
  assert.match(calls[2], /^DELETE .*\/ingestion\/connections\/3$/);
});
