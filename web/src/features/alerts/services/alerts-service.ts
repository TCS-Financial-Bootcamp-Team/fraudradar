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
  decisionPayload,
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
  if (filters.origin) query.set("origin", filters.origin);
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
      summary:
        "A conta apresenta dispersão acentuada de recursos para múltiplas contrapartes em janela curta, compatível com fan-out [F1]. Os indícios recomendam diligência adicional e revisão humana antes de qualquer encaminhamento [F2].",
      content: [
        "## Resumo",
        "A conta apresenta dispersão acentuada de recursos para múltiplas contrapartes em janela curta, compatível com **fan-out** [F1]. Os indícios recomendam diligência adicional e revisão humana antes de qualquer encaminhamento [F2].",
        "",
        "## Sinais de risco",
        "- Concentração temporal das saídas para múltiplas contrapartes em janela de 24 horas (`R-014`).",
        "- Saídas sequenciais logo após recebimento de alto valor (`R-027`).",
        "- Desvio relevante do perfil histórico de destinatários da conta.",
        "",
        "## Contexto transacional",
        "As movimentações da semana concentram transferências fracionadas para contas distintas no mesmo período, mantendo o padrão de dispersão observado no grafo de até dois saltos.",
        "",
        "## Fundamentação jurídica",
        "O conjunto de sinais justifica exame detalhado de compatibilidade econômica e registro formal da análise conforme as obrigações de monitoramento e comunicação previstas na Lei nº 9.613/1998 [F1] e nas diretrizes de prevenção à lavagem de dinheiro [F2].",
        "",
        "## Limitações",
        "A síntese baseia-se apenas nos dados pseudonimizados da janela semanal e nos pesos estatísticos do modelo. Não há confirmação automática de ilícito nem acesso a dados cadastrais externos.",
        "",
        "## Próximos passos sugeridos",
        "1. Verificar a relação econômica entre a conta de origem e os destinatários recorrentes.",
        "2. Conferir o histórico de alertas em semanas anteriores antes de decidir entre arquivamento, aprofundamento ou comunicação.",
      ].join("\n"),
      sources: [
        {
          title: "[F1] Art. 11 · Lei nº 9.613/1998",
          excerpt:
            "As pessoas referidas no art. 9º devem dispensar especial atenção às operações que possam constituir-se em sérios indícios dos crimes previstos nesta Lei e comunicá-las ao COAF.\nFonte oficial: https://www.planalto.gov.br/ccivil_03/leis/l9613.htm",
        },
        {
          title: "[F2] Circular BCB nº 3.978/2020 · Art. 39",
          excerpt:
            "As instituições devem adotar procedimentos de monitoramento, seleção e análise de operações e situações atípicas, mantendo documentação da decisão fundamentada.\nFonte oficial: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Circular&numero=3978",
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
  const payload = decisionPayload(decisionSchema.parse(data));
  if (USE_MOCKS) {
    const mocks = await import("./mocks");
    return alertSchema.parse(mocks.recordDecisionMock(id, payload));
  }
  return alertSchema.parse(
    await apiPost("/alerts/" + encodeURIComponent(id) + "/decision", payload),
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
    const alerts = mocks.currentAlertsMock();
    if (!alerts.some((a) => a.week === nextWeek))
      alerts.push(
        ...alerts.slice(0, 12).map((a, i) => ({
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
