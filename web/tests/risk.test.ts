import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RISK_LABELS,
  formatQueuePosition,
  formatScore,
  riskLevel,
} from "../src/lib/risk";

test("nota de risco: faixas sem 'baixo', porque todo alerta já passou do corte", () => {
  assert.equal(riskLevel(100), "critical");
  assert.equal(riskLevel(90), "critical");
  assert.equal(riskLevel(89.9), "high");
  assert.equal(riskLevel(70), "high");
  assert.equal(riskLevel(69.9), "medium");
  // corte da fila do modelo v1 (42,3) e qualquer nota abaixo dele
  assert.equal(riskLevel(42.3), "medium");
  assert.equal(riskLevel(0), "medium");
  assert.deepEqual(Object.keys(RISK_LABELS).sort(), ["critical", "high", "medium"]);
  assert.ok(!Object.values(RISK_LABELS).includes("Baixo"));
});

test("nota de risco: sempre uma casa decimal com vírgula, e posição ordinal", () => {
  assert.equal(formatScore(87.3), "87,3");
  assert.equal(formatScore(100), "100,0");
  assert.equal(formatScore(42), "42,0");
  assert.equal(formatQueuePosition(1), "1º na fila");
  assert.equal(formatQueuePosition(300), "300º na fila");
});
