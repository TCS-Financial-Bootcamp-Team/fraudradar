import assert from "node:assert/strict";
import { test } from "node:test";
import { metricDelta } from "../src/features/models/components/model-section";
import { jobIsOpen, modelsSchema } from "../src/features/models/schemas/models";
import { modelsMock } from "../src/features/models/services/mocks";
import {
  fetchModels,
  promoteModel,
  startTraining,
} from "../src/features/models/services/models-service";
import { selectDataset } from "../src/lib/dataset";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("o mock cumpre o contrato e tem uma versão ativa", () => {
  const parsed = modelsSchema.parse(modelsMock);
  assert.equal(parsed.versions.filter((v) => v.active).length, 1);
  assert.equal(parsed.active_version, "lightgbm_v1");
});

test("serviços chamam as rotas do conjunto no caminho", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  const job = {
    id: "7",
    kind: "train",
    dataset: "saml-d",
    status: "queued",
    progress: 0,
    message: null,
    created_at: "2026-11-11T10:00:00Z",
    started_at: null,
    finished_at: null,
  };
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    return String(input).endsWith("/train") ? json(job, 202) : json(modelsMock);
  };
  selectDataset("saml-d");
  try {
    await fetchModels("saml-d");
    const started = await startTraining("saml-d");
    await promoteModel("saml-d", "lightgbm_v2");
    assert.equal(jobIsOpen(started), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.deepEqual(
    calls.map((call) => call.replace(/^(\w+) https?:\/\/[^/]+/, "$1 ")),
    [
      "GET /datasets/saml-d/models",
      "POST /datasets/saml-d/train",
      "POST /datasets/saml-d/models/lightgbm_v2/promote",
    ],
  );
});

test("diferença para a versão ativa", () => {
  assert.equal(metricDelta(0.3, 0.25, true), "+5 p.p.");
  assert.equal(metricDelta(0.2, 0.25, true), "−5 p.p.");
  assert.equal(metricDelta(0.25, 0.25, true), "igual");
  assert.equal(metricDelta(12, 10, false), "+2");
  assert.equal(metricDelta(null, 0.25, true), "");
});
