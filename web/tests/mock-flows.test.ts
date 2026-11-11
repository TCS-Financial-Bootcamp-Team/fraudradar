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
  assert.equal(weeksBefore.next_release, "2026-10-26");
  const nextBatch = await s.advanceWeek(week);
  assert.equal(nextBatch.week, "2026-10-26");
  assert.equal(
    (await s.fetchAlerts({ week: nextBatch.week })).total,
    nextBatch.alerts_generated,
  );
  // O seletor só oferece semanas liberadas, da mais recente para a mais antiga.
  const weeksAfter = await s.fetchWeeks();
  assert.equal(weeksAfter.current, "2026-10-26");
  assert.deepEqual(
    weeksAfter.items.map((item) => item.week),
    ["2026-10-26", "2026-10-19", "2026-10-12"],
  );
});

test("mock: conexão, teste, importação e acompanhamento do trabalho nunca devolvem senha", async () => {
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";
  const s =
    await import("../src/features/ingestion/services/ingestion-service");
  const connection = await s.createConnection({
    name: "Teste de contrato",
    host: "financeiro.example.test",
    port: 5432,
    database: "operacoes",
    user: "leitura",
    password: "segredo",
    table: "public.transactions",
    control_column: "id",
  });
  const list = await s.listConnections();
  assert.ok(list.items.some((item) => item.id === connection.id));
  assert.doesNotMatch(JSON.stringify(list), /segredo|postgresql:\/\//);
  const report = await s.testConnection(connection.id);
  assert.equal(report.compatible, true);
  const started = await s.startImport(connection.id, {
    relation: "extend",
    mode: "history",
    control_column: "id",
  });
  assert.equal(started.job.kind, "import");
  let job = started.job;
  for (let i = 0; i < 5 && job.status !== "done"; i++)
    job = await s.fetchJob(job.id);
  assert.equal(job.status, "done");
  assert.ok(
    (await s.listConnections()).items.find((item) => item.id === connection.id)
      ?.last_synced_at,
  );
});
