import { apiGet, apiPost, USE_MOCKS } from "@/lib/api";
import {
  alertSchema,
  approvalSchema,
  reportSchema,
  decisionSchema,
  alertDetailSchema,
  queueSchema,
  graphSchema,
  monitoringSchema,
  assessmentSchema,
  replaySchema,
  weeksSchema,
  type DecisionRequest,
  type AlertFilters,
} from "../schemas/alerts";

export async function fetchAlerts(filters: AlertFilters, signal?: AbortSignal) {
  if (USE_MOCKS)
    return queueSchema.parse((await import("./mocks")).queueMock(filters));
  const query = new URLSearchParams({
    week: filters.week,
    page: String(filters.page ?? 1),
    size: "10",
    sort: "score_desc",
  });
  if (filters.status) query.set("status", filters.status);
  if (filters.country) query.set("country", filters.country);
  if (filters.search) query.set("search", filters.search);
  return queueSchema.parse(await apiGet("/alerts?" + query, { signal }));
}
export async function fetchAlertDetail(id: string, signal?: AbortSignal) {
  return alertDetailSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).alertDetailMock(id)
      : await apiGet("/alerts/" + encodeURIComponent(id), { signal }),
  );
}
export async function fetchAlertGraph(id: string, signal?: AbortSignal) {
  if (USE_MOCKS) {
    const detail = (await import("./mocks")).alertDetailMock(id);
    return graphSchema.parse({
      nodes: [
        { id: detail.account, label: detail.account, central: true },
        ...detail.movements.map((m) => ({
          id: m.receiver,
          label: m.receiver,
          central: false,
        })),
        { id: "CTA-1001", label: "CTA-1001", central: false },
      ],
      edges: [
        ...detail.movements.map((m) => ({
          id: m.id,
          source: detail.account,
          target: m.receiver,
          amount: m.amount,
        })),
        {
          id: "TRX-2H",
          source: detail.movements[0].receiver,
          target: "CTA-1001",
          amount: 3200,
        },
      ],
    });
  }
  return graphSchema.parse(
    await apiGet("/alerts/" + encodeURIComponent(id) + "/graph", { signal }),
  );
}
export async function generateAssessment(id: string) {
  if (USE_MOCKS) {
    const mocks = await import("./mocks");
    mocks.alertDetailMock(id);
    const assessment = assessmentSchema.parse({
      content:
        "O padrão observado é compatível com dispersão de recursos (fan-out). A concentração temporal das saídas e o aumento de contrapartes justificam diligência adicional [1]. A análise constitui um indício e precisa de revisão humana [2].",
      sources: [
        {
          title: "[1] Evidência transacional · R-014",
          excerpt:
            "Transferências sequenciais a múltiplas contrapartes na janela analisada.",
        },
        {
          title: "[2] Guia de análise PLD · base demonstrativa",
          excerpt:
            "Indícios estatísticos não constituem confirmação de ilícito.",
        },
      ],
    });
    mocks.assessmentsMock.set(id, assessment);
    return assessment;
  }
  return assessmentSchema.parse(
    await apiPost("/alerts/" + encodeURIComponent(id) + "/assessment", {}),
  );
}
export async function submitDecision(id: string, data: DecisionRequest) {
  const parsed = decisionSchema.parse(data);
  if (USE_MOCKS) {
    const mocks = await import("./mocks");
    const alert = mocks.alertsMock.find((a) => a.id === id);
    if (!alert) throw new Error("Alerta não encontrado.");
    const statusByDecision = {
      archive: "archived",
      escalate: "escalated",
      report: "reported",
    } as const;
    alert.status = statusByDecision[parsed.decision];
    return alertSchema.parse(alert);
  }
  return alertSchema.parse(
    await apiPost("/alerts/" + encodeURIComponent(id) + "/decision", parsed),
  );
}
export async function fetchReport(id: string, signal?: AbortSignal) {
  return reportSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).reportMock(id)
      : await apiGet("/alerts/" + encodeURIComponent(id) + "/report", {
          signal,
        }),
  );
}
export async function approveReport(id: string, content: string) {
  const parsed = approvalSchema.parse({ content });
  if (USE_MOCKS) {
    const mocks = await import("./mocks");
    const report = {
      ...mocks.reportMock(id),
      content: parsed.content,
      status: "approved" as const,
      updated_at: new Date().toISOString(),
    };
    mocks.reportsMock.set(id, report);
    return reportSchema.parse(report);
  }
  return reportSchema.parse(
    await apiPost(
      "/alerts/" + encodeURIComponent(id) + "/report/approve",
      parsed,
    ),
  );
}
export async function fetchMonitoring(week: string, signal?: AbortSignal) {
  return monitoringSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).monitoringMock(week)
      : await apiGet("/monitoring?week=" + encodeURIComponent(week), {
          signal,
        }),
  );
}
export async function fetchWeeks(signal?: AbortSignal) {
  if (USE_MOCKS) return weeksSchema.parse((await import("./mocks")).weeksMock());
  return weeksSchema.parse(await apiGet("/weeks", { signal }));
}
export async function advanceWeek(week: string) {
  if (USE_MOCKS) {
    const mocks = await import("./mocks");
    const date = new Date(week + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + 7);
    const nextWeek = date.toISOString().slice(0, 10);
    if (!mocks.alertsMock.some((a) => a.week === nextWeek))
      mocks.alertsMock.push(
        ...mocks.alertsMock.slice(0, 12).map((a, i) => ({
          ...a,
          id: "ALT-" + nextWeek + "-" + i,
          week: nextWeek,
          status: "pending" as const,
        })),
      );
    return replaySchema.parse({ week: nextWeek, alerts_generated: 12 });
  }
  return replaySchema.parse(await apiPost("/replay/next-week", {}));
}
