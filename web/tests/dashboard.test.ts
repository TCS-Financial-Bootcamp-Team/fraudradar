import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getAlertLinkLabel } from "../src/features/alerts/components/alerts-table";
import {
  confirmedPrecisionKpi,
  formatWeekPeriod,
} from "../src/features/alerts/components/dashboard";
import {
  describeRate,
  generateSparklinePath,
} from "../src/features/alerts/components/charts";
import { monitoringMock } from "../src/features/alerts/services/mocks";
import { feedbackSummaryMock } from "../src/features/feedback/services/mocks";

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
  assert.equal("recall" in data.indicators, false);

  // Séries para gráficos
  assert.ok(Array.isArray(data.weeks));
  assert.ok(data.weeks.length > 0);
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

test("dashboard: precisão confirmada no lugar do recall da fila", () => {
  const summary = feedbackSummaryMock({ to: "2026-10-19" });
  const kpi = confirmedPrecisionKpi(summary);
  const rate = summary.confirmed_precision;
  assert.ok(rate.denominator > 0);
  assert.match(kpi.note, new RegExp(`^${rate.numerator} de ${rate.denominator} decididos`));
  assert.match(kpi.note, /amostra pequena/); // menos de 20 decisões nos dados simulados
  assert.equal(kpi.spark.length, summary.weekly_confirmed_precision.length);

  const empty = confirmedPrecisionKpi({
    ...summary,
    confirmed_precision: { value: null, numerator: 0, denominator: 0, low_sample: true },
  });
  assert.deepEqual(empty, {
    value: null,
    emptyMessage:
      "Aguardando decisões conclusivas dos analistas para calcular a precisão.",
    note: "Comunique ao COAF ou arquive como falso positivo confirmado na fila de alertas.",
    spark: [],
  });
  assert.deepEqual(confirmedPrecisionKpi(null), empty);

  const zero = confirmedPrecisionKpi({
    ...summary,
    confirmed_precision: { value: 0, numerator: 0, denominator: 5, low_sample: true },
  });
  assert.equal(zero.value, "0%");
  assert.equal(zero.emptyMessage, undefined);

  assert.equal(
    describeRate(
      { name: "19 out", value: 0.75, numerator: 3, denominator: 4, low_sample: true },
      "decididos",
    ),
    "75% · 3 de 4 decididos (amostra pequena)",
  );
});

test("telas de operação não mostram recall nem acerto de tipologia", () => {
  for (const file of ["dashboard.tsx", "monitoring.tsx", "alert-queue.tsx"]) {
    const source = readFileSync(`src/features/alerts/components/${file}`, "utf8");
    assert.doesNotMatch(source, /[Rr]ecall|typology_accuracy|Acerto de tipologia/);
  }
  const monitoring = readFileSync("src/features/alerts/components/monitoring.tsx", "utf8");
  assert.match(monitoring, /FeedbackPanel/);
  assert.doesNotMatch(monitoring, /ModelSection/); // a validação fica em Configurações
  const settings = readFileSync("src/features/settings/components/settings.tsx", "utf8");
  assert.match(settings, /<ModelSection \/>/);
});

test("alertas: linha clicável tem nome acessível e link estendido", () => {
  assert.equal(
    getAlertLinkLabel({ id: "A-42", account: "CTA-001" }),
    "Abrir alerta A-42, conta CTA-001",
  );

  for (const file of ["alerts-table.tsx", "dashboard.tsx"]) {
    const source = readFileSync(
      `src/features/alerts/components/${file}`,
      "utf8",
    );
    assert.match(source, /relative cursor-pointer/);
    assert.match(source, /aria-label=\{getAlertLinkLabel\(alert, locale\)\}/);
    assert.match(source, /after:absolute after:inset-0/);
    assert.match(source, /focus-visible:after:ring-2/);
  }
});

test("dashboard: não exibe o estado de saúde do sistema", () => {
  const source = readFileSync(
    "src/features/alerts/components/dashboard.tsx",
    "utf8",
  );
  assert.doesNotMatch(source, /HealthBadge|Sistema operacional|Sistema degradado/);
});
