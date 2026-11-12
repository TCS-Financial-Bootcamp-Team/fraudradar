import assert from "node:assert/strict";
import { test } from "node:test";
import { pickDataset } from "../src/components/app-context";
import { shouldShowDatasetSelector } from "../src/features/datasets/components/dataset-selector";
import { datasetsMock } from "../src/features/datasets/services/mocks";
import { apiGet } from "../src/lib/api";
import { DEFAULT_DATASET, selectDataset } from "../src/lib/dataset";

test("cliente envia X-Dataset em toda requisição", async () => {
  const previousFetch = globalThis.fetch;
  selectDataset("external-demo");
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("X-Dataset"), "external-demo");
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await apiGet("/health");
  } finally {
    globalThis.fetch = previousFetch;
    selectDataset(DEFAULT_DATASET);
  }
});

test("seletor aparece só com escolha e recupera seleção inválida", () => {
  assert.equal(shouldShowDatasetSelector(datasetsMock.slice(0, 1)), false);
  assert.equal(shouldShowDatasetSelector(datasetsMock), true);
  assert.equal(pickDataset("external-demo", datasetsMock), "external-demo");
  assert.equal(pickDataset("removido", datasetsMock), DEFAULT_DATASET);
});
