import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HISTORY_CONTENT_LIMIT,
  messageSchema,
  chatRequestSchema,
} from "../src/features/assistant/schemas/assistant";

test("modo real usa API e não substitui falhas por mocks; chat sanitiza mensagem e histórico", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/chat"))
      return Response.json({ answer: "Análise disponível.", sources: [] });
    return new Response("Não disponível", { status: 503 });
  };
  try {
    const { sendChatMessage } =
      await import("../src/features/assistant/services/assistant-service");
    await sendChatMessage({
      message: "Investigue conta 12345678",
      context: { page: "/alerts", week: "2026-10-19" },
      history: [{ role: "user", content: "Conta AB1234567" }],
    });
    const payload = JSON.parse(String(calls[0].init?.body));
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.cache, "no-store");
    assert.doesNotMatch(payload.message, /12345678/);
    assert.doesNotMatch(payload.history[0].content, /AB1234567/);
    const { fetchAlerts } =
      await import("../src/features/alerts/services/alerts-service");
    await assert.rejects(
      () =>
        fetchAlerts({
          week: "2026-10-19",
          country: "Brasil",
          status: "pending",
          page: 2,
        }),
      /503/,
    );
    assert.ok(calls[1].url.includes("page=2"));
    assert.ok(calls[1].url.includes("country=Brasil"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resposta de 8.001 caracteres com fontes longas não impede a pergunta seguinte", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  const payloads: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return Response.json({
      answer: "a".repeat(8001),
      sources: [{ title: "Fonte " + "b".repeat(9000), excerpt: "Evidência" }],
    });
  };
  try {
    const { sendChatMessage } =
      await import("../src/features/assistant/services/assistant-service");
    const context = { page: "/alerts", week: "2026-10-19" };
    const response = await sendChatMessage({
      message: "Analise R-014",
      context,
      history: [],
    });
    const displayed = messageSchema.parse({
      role: "assistant",
      content:
        response.answer +
        "\n\nFontes: " +
        response.sources.map((s) => s.title).join("; "),
    });
    assert.equal(response.answer.length, 8001);
    assert.ok(displayed.content.length > HISTORY_CONTENT_LIMIT);
    await sendChatMessage({
      message: "E nas últimas 24 horas?",
      context,
      history: [displayed],
    });
    const secondRequest = chatRequestSchema.parse(payloads[1]);
    assert.equal(
      secondRequest.history[0].content.length,
      HISTORY_CONTENT_LIMIT,
    );
    assert.equal(
      secondRequest.history[0].content,
      displayed.content.slice(0, HISTORY_CONTENT_LIMIT),
    );
    assert.equal(secondRequest.message, "E nas últimas 24 horas?");

    // O corte nunca pode enviar o começo de uma conta identificada no limite.
    await sendChatMessage({
      message:
        "Compare conta 12345678 e conta 87654321 com R-014 em 2026-10-19",
      context,
      history: [
        { role: "user", content: "x".repeat(7990) + " conta 12345678" },
        { role: "assistant", content: "Conta 87654321" },
      ],
    });
    const thirdRequest = chatRequestSchema.parse(payloads[2]);
    assert.doesNotMatch(JSON.stringify(thirdRequest), /12345678|87654321/);
    assert.match(
      thirdRequest.message,
      /\[conta 1\].*\[conta 2\].*R-014.*2026-10-19/,
    );
    assert.ok(
      thirdRequest.history.every(
        (m) => m.content.length <= HISTORY_CONTENT_LIMIT,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
