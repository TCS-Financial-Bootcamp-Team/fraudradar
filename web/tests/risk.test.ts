import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RISK_LABELS,
  formatAlertPlural,
  formatDayMonth,
  formatQueuePosition,
  formatScore,
  formatWeekLabel,
  isHighRisk,
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

test("isHighRisk: verdadeiro para nota >= 98 (destaque em signal)", () => {
  assert.equal(isHighRisk(98), true);
  assert.equal(isHighRisk(99.9), true);
  assert.equal(isHighRisk(100), true);
  assert.equal(isHighRisk(97.9), false);
  assert.equal(isHighRisk(50), false);
});

test("formatWeekLabel e formatDayMonth: formatação consistente em português", () => {
  assert.equal(formatWeekLabel("2026-10-19"), "19 out 2026");
  assert.equal(formatWeekLabel("2023-08-28"), "28 ago 2023");
  assert.equal(formatDayMonth("2026-10-19"), "19 out");
  assert.equal(formatDayMonth("2023-08-30"), "30 ago");
});

test("formatAlertPlural: singular e plural corretos", () => {
  assert.equal(formatAlertPlural(1), "1 alerta encontrado");
  assert.equal(formatAlertPlural(0), "0 alertas encontrados");
  assert.equal(formatAlertPlural(24), "24 alertas encontrados");
});
