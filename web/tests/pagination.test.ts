import assert from "node:assert/strict";
import { test } from "node:test";
import { clampPage, getPageItems } from "../src/lib/pagination";

test("pagination: 1 página e entradas menores que 1", () => {
  assert.deepEqual(getPageItems(1, 1), [1]);
  assert.deepEqual(getPageItems(5, 1), [1]);
  assert.deepEqual(getPageItems(1, 0), []);
  assert.deepEqual(getPageItems(1, -2), []);
});

test("pagination: até 7 páginas exibe todos os números sem reticências", () => {
  assert.deepEqual(getPageItems(1, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(getPageItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(getPageItems(7, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("pagination: início, meio e fim em 20 páginas", () => {
  assert.deepEqual(getPageItems(1, 20), [1, 2, "ellipsis", 20]);
  assert.deepEqual(getPageItems(2, 20), [1, 2, 3, "ellipsis", 20]);
  assert.deepEqual(getPageItems(5, 20), [
    1,
    "ellipsis",
    4,
    5,
    6,
    "ellipsis",
    20,
  ]);
  assert.deepEqual(getPageItems(20, 20), [1, "ellipsis", 19, 20]);
  assert.deepEqual(getPageItems(19, 20), [1, "ellipsis", 18, 19, 20]);
});

test("pagination: página atual fora do intervalo é ajustada aos limites", () => {
  assert.deepEqual(getPageItems(0, 20), [1, 2, "ellipsis", 20]);
  assert.deepEqual(getPageItems(-10, 20), [1, 2, "ellipsis", 20]);
  assert.deepEqual(getPageItems(99, 20), [1, "ellipsis", 19, 20]);
  assert.equal(clampPage(0, 20), 1);
  assert.equal(clampPage(25, 20), 20);
  assert.equal(clampPage(Number.NaN, 20), 1);
});
