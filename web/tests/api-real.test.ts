import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITE_TEXTO_HISTORICO,
  mensagemSchema,
  pedidoChatSchema,
} from "../src/features/assistente/schemas/assistente";

test("modo real usa API e não substitui falhas por mocks; chat sanitiza mensagem e histórico", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  const chamadas: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    chamadas.push({ url: String(input), init });
    if (String(input).endsWith("/chat"))
      return Response.json({ resposta: "Análise disponível.", fontes: [] });
    return new Response("Não disponível", { status: 503 });
  };
  try {
    const { conversar } =
      await import("../src/features/assistente/services/assistente-service");
    await conversar({
      mensagem: "Investigue conta 12345678",
      contexto: { pagina: "/alertas", semana: "2026-10-19" },
      historico: [{ papel: "usuario", texto: "Conta AB1234567" }],
    });
    const corpo = JSON.parse(String(chamadas[0].init?.body));
    assert.equal(chamadas[0].init?.method, "POST");
    assert.equal(chamadas[0].init?.cache, "no-store");
    assert.doesNotMatch(corpo.mensagem, /12345678/);
    assert.doesNotMatch(corpo.historico[0].texto, /AB1234567/);
    const { buscarAlertas } =
      await import("../src/features/alertas/services/alertas-service");
    await assert.rejects(
      () =>
        buscarAlertas({
          semana: "2026-10-19",
          pais: "Brasil",
          status: "pendente",
          pagina: 2,
        }),
      /503/,
    );
    assert.ok(chamadas[1].url.includes("pagina=2"));
    assert.ok(chamadas[1].url.includes("pais=Brasil"));
  } finally {
    globalThis.fetch = original;
  }
});

test("resposta de 8.001 caracteres com fontes longas não impede a pergunta seguinte", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  const corpos: Array<Record<string, unknown>> = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    corpos.push(JSON.parse(String(init?.body)));
    return Response.json({
      resposta: "a".repeat(8001),
      fontes: [{ titulo: "Fonte " + "b".repeat(9000), trecho: "Evidência" }],
    });
  };
  try {
    const { conversar } =
      await import("../src/features/assistente/services/assistente-service");
    const contexto = { pagina: "/alertas", semana: "2026-10-19" };
    const resposta = await conversar({
      mensagem: "Analise R-014",
      contexto,
      historico: [],
    });
    const exibida = mensagemSchema.parse({
      papel: "assistente",
      texto:
        resposta.resposta +
        "\n\nFontes: " +
        resposta.fontes.map((f) => f.titulo).join("; "),
    });
    assert.equal(resposta.resposta.length, 8001);
    assert.ok(exibida.texto.length > LIMITE_TEXTO_HISTORICO);
    await conversar({
      mensagem: "E nas últimas 24 horas?",
      contexto,
      historico: [exibida],
    });
    const segundoPedido = pedidoChatSchema.parse(corpos[1]);
    assert.equal(
      segundoPedido.historico[0].texto.length,
      LIMITE_TEXTO_HISTORICO,
    );
    assert.equal(
      segundoPedido.historico[0].texto,
      exibida.texto.slice(0, LIMITE_TEXTO_HISTORICO),
    );
    assert.equal(segundoPedido.mensagem, "E nas últimas 24 horas?");

    // O corte nunca pode enviar o começo de uma conta identificada no limite.
    await conversar({
      mensagem:
        "Compare conta 12345678 e conta 87654321 com R-014 em 2026-10-19",
      contexto,
      historico: [
        { papel: "usuario", texto: "x".repeat(7990) + " conta 12345678" },
        { papel: "assistente", texto: "Conta 87654321" },
      ],
    });
    const terceiroPedido = pedidoChatSchema.parse(corpos[2]);
    assert.doesNotMatch(JSON.stringify(terceiroPedido), /12345678|87654321/);
    assert.match(
      terceiroPedido.mensagem,
      /\[conta 1\].*\[conta 2\].*R-014.*2026-10-19/,
    );
    assert.ok(
      terceiroPedido.historico.every(
        (m) => m.texto.length <= LIMITE_TEXTO_HISTORICO,
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
