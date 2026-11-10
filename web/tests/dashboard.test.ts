import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWeekPeriod } from "../src/features/alerts/components/dashboard";
import { generateSparklinePath } from "../src/features/alerts/components/charts";
import { monitoringMock } from "../src/features/alerts/services/mocks";

test("dashboard: formatWeekPeriod formata intervalo semanal em UTC", () => {
  // Semana que cruza meses (exemplo do protótipo aprovado)
  assert.equal(
    formatWeekPeriod("2023-08-28"),
    "Semana de 28 ago a 03 set 2023",
  );

  // Semana dentro do mesmo mês
  assert.equal(
    formatWeekPeriod("2026-10-19"),
    "Semana de 19 out a 25 out 2026",
  );

  // Semana que cruza a virada de ano
  assert.equal(
    formatWeekPeriod("2026-12-28"),
    "Semana de 28 dez a 03 jan 2027",
  );

  // Fallback seguro em data malformada
  assert.equal(formatWeekPeriod("invalida"), "Semana de invalida");
});

test("charts: generateSparklinePath gera caminhos SVG válidos", () => {
  // Menos de 2 pontos não gera sparkline
  assert.equal(generateSparklinePath([]), null);
  assert.equal(generateSparklinePath([42]), null);

  // Valores normais geram caminhos de linha (M...L...) e área (...Z)
  const spark = generateSparklinePath([10, 20, 15, 30], 100, 32, 3);
  assert.ok(spark);
  assert.ok(spark.line.startsWith("M"));
  assert.ok(spark.line.includes("L"));
  assert.ok(spark.area.endsWith("Z"));
  assert.ok(!spark.line.includes("NaN"));
  assert.ok(!spark.area.includes("NaN"));

  // Valores constantes não causam divisão por zero (NaN)
  const flat = generateSparklinePath([50, 50, 50], 100, 32, 3);
  assert.ok(flat);
  assert.ok(!flat.line.includes("NaN"));
  assert.ok(!flat.area.includes("NaN"));
});

test("dashboard: monitoringMock fornece dados compatíveis com os cards e KPIs", () => {
  const data = monitoringMock("2026-10-19");

  // Indicadores principais
  assert.equal(typeof data.indicators.alerts, "number");
  assert.equal(typeof data.indicators.alert_rate, "number");
  assert.equal(typeof data.indicators.flagged_amount, "number");
  assert.ok(data.indicators.recall === null || typeof data.indicators.recall === "number");

  // Séries para gráficos
  assert.ok(Array.isArray(data.weeks));
  assert.ok(data.weeks.length > 0);
  assert.ok(Array.isArray(data.recall_series));
  assert.ok(Array.isArray(data.score_histogram));
  assert.equal(data.score_histogram.length, 8);

  // Bin 100 existe no histograma
  const bin100 = data.score_histogram.find((b) => b.name === "100");
  assert.ok(bin100 !== undefined);
  assert.equal(typeof bin100.value, "number");

  // Contagens por status
  assert.equal(typeof data.status_counts.pending, "number");
  assert.equal(typeof data.status_counts.escalated, "number");
  assert.equal(typeof data.status_counts.archived, "number");
  assert.equal(typeof data.status_counts.reported, "number");

  // Países e meios de pagamento
  assert.ok(Array.isArray(data.countries));
  assert.ok(Array.isArray(data.payment_type_rates));
});

test("dashboard: tratamento de recall nulo para semanas de ingestão sem gabarito", () => {
  const data = monitoringMock("2026-10-19");
  // Simular semana sem gabarito
  const noRecallData = {
    ...data,
    indicators: {
      ...data.indicators,
      recall: null,
    },
  };

  const displayValue =
    noRecallData.indicators.recall !== null
      ? `${(noRecallData.indicators.recall * 100).toFixed(1)}%`
      : "—";
  const note =
    noRecallData.indicators.recall !== null
      ? "meta de 95%"
      : "sem gabarito nesta semana";

  assert.equal(displayValue, "—");
  assert.equal(note, "sem gabarito nesta semana");
});
