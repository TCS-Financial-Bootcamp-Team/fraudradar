import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveResourceView, type ResourceState } from "../src/hooks/use-resource";

const loaderA = async () => ({ items: [1, 2] });
const loaderB = async () => ({ items: [3, 4] });
const loaderNullA = async (): Promise<null> => null;
const loaderNullB = async (): Promise<null> => null;

test("useResource: primeira carga retorna loading true e sem dados", () => {
  const initial: ResourceState<{ items: number[] }> = {
    hasData: false,
    settledVersion: -1,
    settledResetKey: undefined,
  };
  assert.deepEqual(deriveResourceView(initial, loaderA, 0, undefined), {
    data: undefined,
    error: undefined,
    loading: true,
    refreshing: false,
    hasUsableData: false,
  });
});

test("useResource: refetch (troca de loader ou reload) mantém dado anterior com refreshing true", () => {
  const settled: ResourceState<{ items: number[] }> = {
    data: { items: [1, 2] },
    hasData: true,
    settledLoader: loaderA,
    settledVersion: 0,
    settledResetKey: undefined,
  };

  assert.deepEqual(deriveResourceView(settled, loaderB, 0, undefined), {
    data: { items: [1, 2] },
    error: undefined,
    loading: false,
    refreshing: true,
    hasUsableData: true,
  });

  assert.deepEqual(deriveResourceView(settled, loaderA, 1, undefined), {
    data: { items: [1, 2] },
    error: undefined,
    loading: false,
    refreshing: true,
    hasUsableData: true,
  });
});

test("useResource: troca de resetKey descarta dado anterior e volta a loading true", () => {
  const settled: ResourceState<{ items: number[] }> = {
    data: { items: [1, 2] },
    hasData: true,
    settledLoader: loaderA,
    settledVersion: 0,
    settledResetKey: "ALT-12",
  };

  assert.deepEqual(deriveResourceView(settled, loaderB, 0, "ALT-13"), {
    data: undefined,
    error: undefined,
    loading: true,
    refreshing: false,
    hasUsableData: false,
  });
});

test("useResource: erro inicial aparece quando não há dado; valor null conta como dado carregado", () => {
  const errored: ResourceState<null> = {
    data: undefined,
    hasData: false,
    error: "Falha",
    settledLoader: loaderNullA,
    settledVersion: 0,
    settledResetKey: undefined,
  };
  assert.deepEqual(deriveResourceView(errored, loaderNullA, 0, undefined), {
    data: undefined,
    error: "Falha",
    loading: false,
    refreshing: false,
    hasUsableData: false,
  });

  // Ao tentar novamente (reload), erro limpa e loading volta a true
  assert.deepEqual(deriveResourceView(errored, loaderNullA, 1, undefined), {
    data: undefined,
    error: undefined,
    loading: true,
    refreshing: false,
    hasUsableData: false,
  });

  const settledNull: ResourceState<null> = {
    data: null,
    hasData: true,
    settledLoader: loaderNullA,
    settledVersion: 0,
    settledResetKey: undefined,
  };
  assert.deepEqual(deriveResourceView(settledNull, loaderNullB, 0, undefined), {
    data: null,
    error: undefined,
    loading: false,
    refreshing: true,
    hasUsableData: true,
  });
});
