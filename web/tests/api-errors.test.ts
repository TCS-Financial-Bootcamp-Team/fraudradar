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

test("erro convertido: traduz por code + params; código desconhecido cai no detail", () => {
  const body = {
    detail: "Alerta 7 não encontrado.",
    code: "alert.not_found",
    params: { id: 7 },
  };
  assert.equal(errorMessageFor(404, body, generic), "Alerta 7 não encontrado.");
  assert.equal(errorMessageFor(404, body, generic, "en"), "Alert 7 not found.");
  assert.equal(
    errorMessageFor(
      409,
      {
        detail: "Bloqueada: acha 5,0 p.p. menos lavadoras.",
        code: "model.gate_blocked",
        params: {
          gap_pp: 5,
          new_pct: 90,
          current_pct: 95,
          active_version: "lightgbm_v1",
          limit_pp: 1,
        },
      },
      generic,
      "en",
    ),
    "Blocked: it finds 5 p.p. fewer laundering accounts in the queue than the active version (lightgbm_v1) over the same test period (90% against 95%); the limit is 1 p.p.",
  );
  // Código que o front ainda não conhece: mostra o detail em português, como antes.
  assert.equal(
    errorMessageFor(
      409,
      { detail: "Texto novo do servidor.", code: "algo.que_nao_existe", params: {} },
      generic,
      "en",
    ),
    "Texto novo do servidor.",
  );
  // Sem código (erro não convertido): só o detail.
  assert.equal(
    errorMessageFor(500, { detail: "Erro antigo." }, generic, "en"),
    "Erro antigo.",
  );
  assert.equal(
    errorMessageFor(401, { detail: "x", code: "auth.missing" }, generic, "en"),
    "Your session expired. Sign in again.",
  );
});
