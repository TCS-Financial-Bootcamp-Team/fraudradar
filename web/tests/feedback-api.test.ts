import assert from "node:assert/strict";
import { test } from "node:test";

// Arquivo à parte: USE_MOCKS é lido ao importar o serviço (ver scripts/run-tests.mjs).
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("retorno: o serviço chama /feedback/summary com o período", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  const { fetchFeedbackSummary } = await import(
    "../src/features/feedback/services/feedback-service"
  );
  const { feedbackSummaryMock } = await import("../src/features/feedback/services/mocks");
  const previousFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return json(feedbackSummaryMock({}));
  };
  try {
    await fetchFeedbackSummary({ to: "2026-10-19" });
    await fetchFeedbackSummary();
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.deepEqual(
    urls.map((url) => url.replace(/^https?:\/\/[^/]+/, "")),
    ["/feedback/summary?to=2026-10-19", "/feedback/summary"],
  );
});
