import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../src/lib/api";

test("assistant-service: rotas reais de modelos, conversas, sanitização de page_state e preservação de code", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith("/ai/models")) {
      return Response.json({
        default: "gemini-2.5-flash",
        models: [
          { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
        ],
      });
    }
    if (url.endsWith("/chat/conversations?limit=30")) {
      return Response.json([
        {
          id: 7,
          title: "Resumo",
          updated_at: "2026-11-18T10:00:00Z",
          message_count: 2,
        },
      ]);
    }
    if (url.endsWith("/chat/conversations/7") && method === "GET") {
      return Response.json({
        id: 7,
        title: "Resumo",
        updated_at: "2026-11-18T10:00:00Z",
        messages: [
          {
            role: "user",
            content: "Onde importo?",
            sources: [],
            links: [],
          },
        ],
      });
    }
    if (url.endsWith("/chat/conversations/7") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/chat") && body?.model === "unavailable-test") {
      return Response.json(
        {
          detail: "Provedor indisponível",
          code: "ai.provider_unavailable",
          params: {},
        },
        { status: 503 },
      );
    }
    if (url.endsWith("/chat") && body?.conversation_id === 999) {
      return Response.json(
        {
          detail: "Conversa não encontrada",
          code: "chat.conversation_not_found",
          params: {},
        },
        { status: 404 },
      );
    }
    return Response.json({
      kind: "system",
      answer: "Abra Fontes de dados.",
      sources: [],
      links: [{ href: "/ingestion", label: "Abrir Fontes de dados" }],
      model: "gemini-2.5-pro",
      conversation_id: 7,
    });
  };

  try {
    const svc = await import("../src/features/assistant/services/assistant-service");

    const catalog = await svc.fetchAiModels();
    assert.equal(catalog.default, "gemini-2.5-flash");
    assert.equal(catalog.models.length, 2);

    const convs = await svc.listConversations();
    assert.equal(convs[0].id, 7);

    const detail = await svc.fetchConversation(7);
    assert.equal(detail.messages.length, 1);

    await svc.deleteConversation(7);
    assert.equal(calls.at(-1)?.method, "DELETE");

    const response = await svc.sendChatMessage({
      message: "Resuma",
      context: {
        page: "/alerts",
        path: "/alerts",
        week: "2026-10-19",
        page_state: {
          filters: { search: "CTA-810" },
          visible_alert_ids: [3073],
          page: 1,
          total: 1,
        },
      },
      history: [],
      model: "gemini-2.5-pro",
      conversation_id: 7,
    });
    assert.equal(response.kind, "system");
    assert.equal(response.conversation_id, 7);
    const sentPayload = calls.at(-1)?.body as {
      context: { page_state: { filters: { search: string } } };
    };
    assert.doesNotMatch(sentPayload.context.page_state.filters.search, /CTA-810/);

    await assert.rejects(
      () =>
        svc.sendChatMessage({
          message: "Oi",
          context: { page: "/dashboard", path: "/dashboard", week: "2026-10-19" },
          history: [],
          model: "unavailable-test",
        }),
      (err: unknown) =>
        err instanceof ApiError && err.code === "ai.provider_unavailable",
    );

    await assert.rejects(
      () =>
        svc.sendChatMessage({
          message: "Oi",
          context: { page: "/dashboard", path: "/dashboard", week: "2026-10-19" },
          history: [],
          conversation_id: 999,
        }),
      (err: unknown) =>
        err instanceof ApiError && err.code === "chat.conversation_not_found",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
