import assert from "node:assert/strict";
import { test } from "node:test";

test("mock: decisão, parecer, comunicação e replay preservam consistência na sessão", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const s = await import("../src/features/alerts/services/alerts-service");
  const week = "2026-10-19";
  const queue = await s.fetchAlerts({ week, status: "pending" });
  const id = queue.items[0].id;
  await assert.rejects(
    () => s.fetchReport(id),
    /Este alerta não tem comunicação/,
  );
  const before = await s.fetchMonitoring(week);
  await s.generateAssessment(id);
  assert.ok((await s.fetchAlertDetail(id)).assessment?.sources.length);
  await s.submitDecision(id, {
    decision: "report",
    justification:
      "Movimentações atípicas confirmadas para diligência e revisão.",
  });
  assert.equal((await s.fetchAlertDetail(id)).status, "reported");
  assert.equal((await s.fetchReport(id)).status, "draft");
  const reportContent =
    "Relato revisado e complementado com as evidências do caso. Comunicação acadêmica sem transmissão externa.";
  await s.approveReport(id, reportContent);
  assert.equal((await s.fetchReport(id)).content, reportContent);
  assert.equal((await s.fetchReport(id)).status, "approved");
  assert.equal(
    (await s.fetchMonitoring(week)).indicators.reported,
    before.indicators.reported + 1,
  );
  const graph = await s.fetchAlertGraph(id);
  assert.ok(graph.nodes.every((n) => n.label.startsWith("CTA-")));
  assert.ok(
    graph.edges.every(
      (e) =>
        graph.nodes.some((n) => n.id === e.source) &&
        graph.nodes.some((n) => n.id === e.target),
    ),
  );
  const weeksBefore = await s.fetchWeeks();
  assert.equal(weeksBefore.current, week);
  assert.equal(weeksBefore.next_release, null);
  const nextBatch = await s.advanceWeek(week);
  assert.equal(nextBatch.week, "2026-10-26");
  assert.equal(
    (await s.fetchAlerts({ week: nextBatch.week })).total,
    nextBatch.alerts_generated,
  );
  // O seletor oferece todos os períodos processados, do mais recente ao mais antigo.
  const weeksAfter = await s.fetchWeeks();
  assert.equal(weeksAfter.current, "2026-10-26");
  assert.deepEqual(
    weeksAfter.items.map((item) => item.week),
    ["2026-10-26", "2026-10-19", "2026-10-12"],
  );
});

test("mock: registro e sincronização nunca devolvem senha nem URI", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const s =
    await import("../src/features/ingestion/services/ingestion-service");
  const source = await s.registerDataSource({
    name: "Teste de contrato",
    type: "postgres",
    connection_string:
      "postgresql://leitura:segredo@financeiro.example.test:5432/operacoes",
    ssl: true,
  });
  const list = await s.listDataSources();
  assert.ok(list.items.some((item) => item.id === source.id));
  assert.doesNotMatch(JSON.stringify(list), /segredo|postgresql:\/\//);
  assert.ok((await s.syncDataSource(source.id)).last_synced_at);
});
