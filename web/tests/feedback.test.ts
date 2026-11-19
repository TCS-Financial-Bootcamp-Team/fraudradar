import assert from "node:assert/strict";
import { test } from "node:test";
import { feedbackSummarySchema } from "../src/features/feedback/schemas/feedback";
import { CONTROL_SAMPLE_HINT, getAlertLinkLabel } from "../src/features/alerts/components/alerts-table";

// Os serviços leem USE_MOCKS ao serem importados: só os importe (dinamicamente) depois de ligar.
process.env.NEXT_PUBLIC_USE_MOCKS = "true";

test("retorno: o mock cumpre o contrato e segue as decisões da sessão", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const alerts = await import("../src/features/alerts/services/alerts-service");
  const { feedbackSummaryMock } = await import("../src/features/feedback/services/mocks");
  const week = "2026-10-19";
  const before = feedbackSummarySchema.parse(feedbackSummaryMock({ to: week }));
  assert.ok(before.control_sample.sampled > 0);

  const queue = await alerts.fetchAlerts({ week, status: "pending", origin: "model" });
  const [first, second] = queue.items;
  await alerts.submitDecision(first.id, {
    decision: "archive",
    archive_reason: "false_positive",
    justification: "Movimentação explicada pelo perfil do cliente.",
  });
  await alerts.submitDecision(second.id, {
    decision: "archive",
    archive_reason: "insufficient_evidence",
    justification: "Faltam documentos para concluir a análise.",
  });
  const after = feedbackSummaryMock({ to: week });
  // falso positivo confirmado vira rótulo 0; sem evidência suficiente não vira rótulo
  assert.equal(after.labels.false_positive, before.labels.false_positive + 1);
  assert.equal(after.labels.total, before.labels.total + 1);
  assert.equal(after.confirmed_precision.denominator, before.confirmed_precision.denominator + 1);

  const sample = await alerts.fetchAlerts({ week, origin: "exploration" });
  assert.ok(sample.items.length > 0);
  assert.ok(sample.items.every((a) => a.origin === "exploration"));
  await alerts.submitDecision(sample.items[0].id, {
    decision: "report",
    justification: "Lavagem achada na conta sorteada abaixo do corte.",
  });
  const found = feedbackSummaryMock({ to: week });
  assert.equal(found.control_sample.found_outside_queue.numerator, 1);
  assert.equal(found.control_sample.found_outside_queue.low_sample, true);
});

test("fila: a amostra de controle vem no fim, fora das contagens", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const alerts = await import("../src/features/alerts/services/alerts-service");
  const week = "2026-10-12";
  const queue = await alerts.fetchAlerts({ week, page: 2 });
  const origins = queue.items.map((a) => a.origin);
  assert.deepEqual(origins.slice(-3), ["exploration", "exploration", "exploration"]);
  const monitoring = await alerts.fetchMonitoring(week);
  const modelOnly = await alerts.fetchAlerts({ week, origin: "model" });
  assert.equal(monitoring.indicators.alerts, modelOnly.total);
  assert.equal(
    getAlertLinkLabel({ id: "A-1", account: "CTA-1", origin: "exploration" }),
    "Abrir alerta A-1, conta CTA-1 (amostra de controle)",
  );
  assert.match(CONTROL_SAMPLE_HINT, /abaixo do corte/);
});

test("retorno: as células do painel avisam amostra pequena e período sem decisão", async () => {
  const { feedbackCells } = await import("../src/features/feedback/components/feedback-panel");
  const { feedbackSummaryMock } = await import("../src/features/feedback/services/mocks");
  const summary = feedbackSummarySchema.parse(feedbackSummaryMock({}));
  const cells = feedbackCells(summary);
  assert.deepEqual(
    cells.map((c) => c.label),
    [
      "Precisão confirmada",
      "Lavagem fora da fila",
      "Rótulos do retorno",
      "Novos desde a versão ativa",
    ],
  );
  assert.notEqual(cells[0].value, null);
  assert.equal(cells[0].emptyMessage, undefined);
  assert.match(cells[0].note, /amostra pequena/);
  const empty = feedbackCells({
    ...summary,
    confirmed_precision: { value: null, numerator: 0, denominator: 0, low_sample: true },
    control_sample: {
      sampled: 0,
      reviewed: 0,
      found_outside_queue: { value: null, numerator: 0, denominator: 0, low_sample: true },
    },
  });
  assert.equal(empty[0].value, null);
  assert.equal(
    empty[0].emptyMessage,
    "Aguardando decisões conclusivas dos analistas para calcular a precisão.",
  );
  assert.equal(
    empty[0].note,
    "Comunique ao COAF ou arquive como falso positivo confirmado na fila de alertas.",
  );
  assert.equal(empty[1].value, null);
  assert.equal(
    empty[1].emptyMessage,
    "Nenhuma conta da amostra de controle foi revisada até o momento.",
  );
  assert.equal(
    empty[1].note,
    "Nenhuma conta sorteada até esta semana. Configure o tamanho da amostra em Configurações > Processamento.",
  );

  const sampledPending = feedbackCells({
    ...summary,
    control_sample: {
      sampled: 3,
      reviewed: 0,
      found_outside_queue: { value: null, numerator: 0, denominator: 0, low_sample: true },
    },
  });
  assert.equal(sampledPending[1].value, null);
  assert.equal(
    sampledPending[1].emptyMessage,
    "Nenhuma conta da amostra de controle foi revisada até o momento.",
  );
  assert.equal(
    sampledPending[1].note,
    "3 contas sorteadas aguardam decisão conclusiva na fila.",
  );
});
