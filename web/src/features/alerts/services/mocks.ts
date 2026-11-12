import type {
  Alert,
  ArchiveReason,
  Report,
  AlertDetail,
  AlertFilters,
  DecisionRequest,
  Monitoring,
  Weeks,
} from "../schemas/alerts";
import { getCurrentDataset } from "@/lib/dataset";

// Amostra de controle por semana nos dados simulados: contas sorteadas abaixo do corte.
const CONTROL_SAMPLE_PER_WEEK = 3;

function makeAlerts(dataset: string): Alert[] {
  const external = dataset === "external-demo";
  const queue: Alert[] = Array.from({ length: external ? 18 : 36 }, (_, i) => ({
    id: "ALT-" + String((external ? 3401 : 2401) + i),
    account: "CTA-" + String((external ? 1810 : 810) + i),
    week: external
      ? i < 12
        ? "2026-11-02"
        : "2026-10-26"
      : i < 24
        ? "2026-10-19"
        : "2026-10-12",
    country: [
      "Brasil",
      "Portugal",
      "Reino Unido",
      "Estados Unidos",
      "Emirados Árabes",
    ][i % 5],
    typology: [
      "Fan-out",
      "Estruturação",
      "Ciclo financeiro",
      "Fan-in",
      "Dispersão internacional",
    ][i % 5],
    score: Math.max(43, 98 - i * 2),
    queue_position: i + 1,
    amount: 845000 - i * 15730,
    transaction_count: 47 - i,
    status:
      i % 9 === 0
        ? "reported"
        : i % 7 === 0
          ? "archived"
          : i % 4 === 0
            ? "escalated"
            : "pending",
    origin: "model" as const,
  }));
  const sampled: Alert[] = [...new Set(queue.map((a) => a.week))].flatMap(
    (week, w) => {
      const inWeek = queue.filter((a) => a.week === week).length;
      return Array.from({ length: CONTROL_SAMPLE_PER_WEEK }, (_, i) => ({
        id: "ALT-" + String((external ? 3901 : 2901) + w * 10 + i),
        account: "CTA-" + String((external ? 1950 : 950) + w * 10 + i),
        week,
        country: ["Brasil", "Portugal", "Reino Unido"][i % 3],
        typology: "Indefinida",
        score: [12.4, 7.9, 3.1][i % 3],
        queue_position: inWeek + i + 1,
        amount: 4800 + i * 1230,
        transaction_count: 6 + i,
        status: w === 1 && i === 0 ? ("archived" as const) : ("pending" as const),
        origin: "exploration" as const,
      }));
    },
  );
  return [...queue, ...sampled];
}

export const alertsByDataset: Record<string, Alert[]> = {
  "saml-d": makeAlerts("saml-d"),
  "external-demo": makeAlerts("external-demo"),
};
export const alertsMock = alertsByDataset["saml-d"];
export function currentAlertsMock() {
  return alertsByDataset[getCurrentDataset()] ?? alertsMock;
}
export const reportsMock = new Map<string, Report>();
export const assessmentsMock = new Map<string, AlertDetail["assessment"]>();

type MockDecision = {
  decision: DecisionRequest["decision"];
  archive_reason?: ArchiveReason;
};
// A última decisão de cada alerta (o retorno dos analistas sai daqui). Os status iniciais dos
// dados simulados contam como decisões já tomadas: arquivado = falso positivo confirmado.
export const decisionsMock = new Map<string, MockDecision>();
function seededDecision(alert: Alert): MockDecision | undefined {
  if (alert.status === "reported") return { decision: "report" };
  if (alert.status === "archived")
    return { decision: "archive", archive_reason: "false_positive" };
  if (alert.status === "escalated") return { decision: "escalate" };
  return undefined;
}
export function decisionOfMock(alert: Alert): MockDecision | undefined {
  return decisionsMock.get(alert.id) ?? seededDecision(alert);
}
export function recordDecisionMock(id: string, request: MockDecision) {
  const alert = currentAlertsMock().find((a) => a.id === id);
  if (!alert) throw new Error("Alerta não encontrado.");
  const statusByDecision = {
    archive: "archived",
    escalate: "escalated",
    report: "reported",
  } as const;
  alert.status = statusByDecision[request.decision];
  decisionsMock.set(id, {
    decision: request.decision,
    archive_reason: request.archive_reason,
  });
  return alert;
}

export function queueMock(filters: AlertFilters) {
  const searchTerm = filters.search?.trim();
  const isDigits = searchTerm ? /^\d+$/.test(searchTerm) : false;
  const alerts = currentAlertsMock();
  const items = alerts
    .filter(
      (a) =>
        (!filters.week || a.week === filters.week) &&
        (!filters.status || a.status === filters.status) &&
        (!filters.country || a.country === filters.country) &&
        (!filters.origin || a.origin === filters.origin) &&
        (!searchTerm ||
          (isDigits
            ? a.id === searchTerm ||
              a.id === "ALT-" + searchTerm ||
              a.account.startsWith(searchTerm) ||
              a.account.startsWith("CTA-" + searchTerm)
            : a.account.startsWith(searchTerm))),
    )
    // A amostra de controle vem sempre depois da fila do modelo.
    .sort(
      (a, b) =>
        Number(a.origin === "exploration") -
          Number(b.origin === "exploration") || b.score - a.score,
    );
  const start = ((filters.page ?? 1) - 1) * 10;
  return {
    items: items.slice(start, start + 10),
    total: items.length,
    countries: [...new Set(alerts.map((a) => a.country))],
  };
}
export function weeksMock(): Weeks {
  const alerts = currentAlertsMock().filter((a) => a.origin === "model");
  const weeks = [...new Set(alerts.map((a) => a.week))].sort().reverse();
  return {
    current: weeks[0] ?? null,
    next_release: null,
    items: weeks.map((week) => {
      const ofWeek = alerts.filter((a) => a.week === week);
      return {
        week,
        alerts: ofWeek.length,
        pending: ofWeek.filter((a) => a.status === "pending").length,
      };
    }),
  };
}
export function alertDetailMock(id: string): AlertDetail {
  const alert = currentAlertsMock().find((a) => a.id === id);
  if (!alert) throw new Error("Alerta não encontrado.");
  return {
    ...alert,
    contributions: [
      { name: "Dispersão de contrapartes", value: 38 },
      { name: "Velocidade de movimentação", value: 29 },
      { name: "Desvio do perfil histórico", value: 21 },
      { name: "Fluxo internacional", value: 12 },
    ],
    rules: [
      {
        code: "R-014",
        description: "Múltiplos destinatários em uma janela de 24 horas.",
      },
      {
        code: "R-027",
        description: "Saídas sequenciais após recebimento de alto valor.",
      },
    ],
    movements: Array.from({ length: 8 }, (_, i) => ({
      id: "TRX-" + (901 + i),
      date: "2026-10-20T" + String(10 + i).padStart(2, "0") + ":30:00Z",
      sender: alert.account,
      receiver: "CTA-" + (920 + i),
      amount: 12750 + i * 4100,
      currency: "BRL",
      payment_type: ["Transferência", "Cartão", "Dinheiro"][i % 3],
    })),
    assessment: assessmentsMock.get(id) ?? null,
  };
}
export function reportMock(id: string): Report {
  const alert = alertDetailMock(id);
  const existing = reportsMock.get(id);
  if (existing) return existing;
  if (alert.status !== "reported") {
    throw new Error("Este alerta não tem comunicação.");
  }
  return {
    alert_id: id,
    status: "draft",
    updated_at: "2026-10-21T14:30:00Z",
    content:
      "RELATO DE OPERAÇÃO ATÍPICA\n\nO monitoramento identificou dispersão de recursos para múltiplas contrapartes em curto intervalo, com movimentação incompatível com o histórico observado.\n\nEvidências: regra R-014 e transferências vinculadas ao alerta " +
      id +
      ".\n\nRecomendação: avaliar as evidências e complementar a diligência antes de qualquer comunicação oficial. Este documento é uma simulação acadêmica.",
  };
}
export function monitoringMock(week: string): Monitoring {
  // Alerta é a conta da fila do modelo; a amostra de controle fica fora das contagens.
  const items = currentAlertsMock().filter(
    (a) => a.week === week && a.origin === "model",
  );
  const groupCount = (field: "typology" | "country") =>
    [...new Set(items.map((a) => a[field]))]
      .map((name) => ({
        name,
        value: items.filter((a) => a[field] === name).length,
      }))
      .sort((a, b) => b.value - a.value);
  return {
    week,
    indicators: {
      alerts: items.length,
      reviewed: items.filter((a) => a.status !== "pending").length,
      reported: items.filter(
        (a) =>
          a.status === "reported" &&
          reportsMock.get(a.id)?.status === "approved",
      ).length,
      alert_rate: items.length ? 0.024 : 0,
      flagged_amount: items.reduce((sum, a) => sum + a.amount, 0),
    },
    weeks: [
      { name: "14 set", value: 12 },
      { name: "21 set", value: 17 },
      { name: "28 set", value: 14 },
      { name: "05 out", value: 21 },
      { name: "12 out", value: 12 },
      { name: "19 out", value: 24 },
    ],
    typologies: groupCount("typology"),
    countries: groupCount("country"),
    country_rates: ["Brasil", "Portugal", "Reino Unido", "Estados Unidos"].map(
      (name, i) => ({ name, value: [0.024, 0.031, 0.018, 0.012][i] }),
    ),
    payment_type_rates: [
      "Transferência",
      "Cartão",
      "Dinheiro",
      "Pagamento digital",
    ].map((name, i) => ({ name, value: [0.032, 0.014, 0.048, 0.021][i] })),
    score_histogram: [
      { name: "40", value: items.filter((a) => a.score < 50).length },
      {
        name: "50",
        value: items.filter((a) => a.score >= 50 && a.score < 60).length,
      },
      {
        name: "60",
        value: items.filter((a) => a.score >= 60 && a.score < 70).length,
      },
      {
        name: "70",
        value: items.filter((a) => a.score >= 70 && a.score < 80).length,
      },
      {
        name: "80",
        value: items.filter((a) => a.score >= 80 && a.score < 90).length,
      },
      {
        name: "90",
        value: items.filter((a) => a.score >= 90 && a.score < 95).length,
      },
      {
        name: "95",
        value: items.filter((a) => a.score >= 95 && a.score < 99.95).length,
      },
      { name: "100", value: items.filter((a) => a.score >= 99.95).length },
    ],
    status_counts: {
      pending: items.filter((a) => a.status === "pending").length,
      escalated: items.filter((a) => a.status === "escalated").length,
      archived: items.filter((a) => a.status === "archived").length,
      reported: items.filter((a) => a.status === "reported").length,
    },
  };
}
