import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { lerTranscrito, redigir, sanitizar } from "../scripts/importadores";
async function transcrito(linhas: unknown[], fonte: "claude" | "codex") {
  const dir = path.resolve("trash", `teste-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const arquivo = path.join(dir, "sessao.jsonl");
  await writeFile(arquivo, linhas.map((l) => JSON.stringify(l)).join("\n"));
  try {
    const resultado = [];
    for await (const n of lerTranscrito(arquivo, fonte)) resultado.push(n);
    return resultado;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("redige os padrões secretos sem corromper Markdown ou objetos", () => {
  const v =
    "sbp_falso123 sb_secret_falso sk-falso eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura postgres://user:senha@localhost/db";
  const s = redigir(v);
  assert.equal(redigir('password="minha senha com espaços"'), 'password="[SEGREDO REMOVIDO]"');
  for (const secreto of ["sbp_falso", "sb_secret_falso", "sk-falso", "eyJhbGci", ":senha@"])
    assert.ok(!s.includes(secreto));
  assert.deepEqual(sanitizar({ texto: 'Diga "olá"\n```json\n{"password":"valor"}\n```' }), {
    texto: 'Diga "olá"\n```json\n{"password":"[SEGREDO REMOVIDO]"}\n```',
  });
});

test("redige Authorization completo, tokens opacos e Postgres com usuário vazio", () => {
  for (const cabecalho of [
    "Authorization: Basic dXN1YXJpbzpzZW5oYQ==",
    "Authorization: Bearer token-opaco",
    "authorization: Digest credencial opaca com espaços",
    '"Authorization": "Bearer token-opaco"',
    "'Proxy-Authorization': 'Basic dXN1YXJpbzpzZW5oYQ=='",
  ]) {
    const resultado = redigir(cabecalho);
    assert.match(resultado, /AUTORIZAÇÃO REMOVIDA/);
    assert.doesNotMatch(resultado, /dXN1YXJpbzpzZW5oYQ|token-opaco|credencial opaca/);
  }
  assert.deepEqual(JSON.parse(redigir('{"Authorization":"Bearer token-opaco"}')), {
    Authorization: "[AUTORIZAÇÃO REMOVIDA]",
  });
  assert.deepEqual(sanitizar({ headers: { Authorization: "Basic opaco" } }), {
    headers: { Authorization: "[AUTORIZAÇÃO REMOVIDA]" },
  });
  for (const protocolo of ["postgres", "postgresql"]) {
    const resultado = redigir(`${protocolo}://:senha%40especial@host/banco`);
    assert.equal(resultado, `${protocolo}://:[SENHA REMOVIDA]@host/banco`);
  }
});

test("Codex mantém IDs e pais ao acrescentar task_complete ao mesmo transcrito", async () => {
  const linhas = [
    { type: "session_meta", payload: { id: "sessao-estavel" } },
    {
      type: "response_item",
      payload: { type: "message", role: "user", content: "Primeiro pedido" },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "final_answer",
        content: "Primeira resposta",
      },
    },
  ];
  const antes = await transcrito(linhas, "codex");
  const depois = await transcrito(
    [
      ...linhas,
      {
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "turno-1",
          last_agent_message: "Primeira resposta",
        },
      },
      {
        type: "response_item",
        payload: { type: "message", role: "user", content: "Segundo pedido" },
      },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: "Segunda resposta",
        },
      },
    ],
    "codex",
  );
  assert.equal(antes[1].origem_id, `${antes[0].origem_id}:resposta`);
  assert.equal(depois[1].origem_id, antes[1].origem_id);
  assert.equal(depois[1].pai, antes[1].pai);
  assert.equal(depois[2].pai, antes[1].origem_id);
  assert.notEqual(depois[3].origem_id, antes[1].origem_id);
  const upsert = new Map([...antes, ...depois].map((n) => [n.origem_id, n]));
  assert.equal(upsert.size, 4);
});
test("Claude ignora ferramentas e usa só a última resposta de cada turno", async () => {
  const dados = [
    { type: "user", uuid: "u1", message: { role: "user", content: "Treine o modelo" } },
    {
      type: "assistant",
      uuid: "a0",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Vou analisar" },
          { type: "tool_use", name: "Read" },
        ],
      },
    },
    {
      type: "user",
      uuid: "tool",
      message: { role: "user", content: [{ type: "tool_result", content: "segredo" }] },
    },
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [{ type: "text", text: "Primeira versão" }] },
    },
    {
      type: "assistant",
      uuid: "a2",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Modelo treinado: sb_secret_falso" }],
      },
    },
    { type: "user", uuid: "u2", message: { role: "user", content: "Agora valide" } },
    {
      type: "assistant",
      uuid: "a3",
      message: { role: "assistant", content: [{ type: "text", text: "Validado" }] },
    },
  ];
  const r = await transcrito(dados, "claude");
  assert.equal(r.length, 4);
  assert.equal(r[1].conteudo, "Modelo treinado: [SEGREDO REMOVIDO]");
  assert.equal(r[1].pai, r[0].origem_id);
  assert.equal(r[2].pai, r[1].origem_id);
  assert.equal(r[3].pai, r[2].origem_id);
  const novamente = await transcrito(dados, "claude");
  assert.deepEqual(
    r.map((n) => n.origem_id),
    novamente.map((n) => n.origem_id),
  );
});
test("Codex ignora lembretes, comentários e eventos duplicados", async () => {
  const r = await transcrito(
    [
      { type: "session_meta", payload: { id: "sessao-codex" } },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "# AGENTS.md instructions for C:/repo" }],
        },
      },
      {
        type: "response_item",
        timestamp: "2026-10-26T10:00:00Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Implemente a API" }],
        },
      },
      { type: "event_msg", payload: { type: "user_message", message: "Implemente a API" } },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "commentary",
          content: [{ type: "output_text", text: "Analisando" }],
        },
      },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: [{ type: "output_text", text: "API entregue" }],
        },
      },
      {
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "t1", last_agent_message: "API entregue" },
      },
    ],
    "codex",
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].conteudo, "Implemente a API");
  assert.equal(r[1].conteudo, "API entregue");
  assert.match(r[0].origem_id!, /^codex:sessao-codex:/);
  assert.equal(r[1].pai, r[0].origem_id);
});
