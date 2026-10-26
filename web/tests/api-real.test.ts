import assert from "node:assert/strict";
import { test } from "node:test";

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
