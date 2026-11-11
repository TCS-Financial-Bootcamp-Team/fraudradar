"use client";

import { useCallback, useState } from "react";
import { notify } from "@/lib/notify";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { fetchAccountAlerts } from "@/features/accounts/services/accounts-service";
import { getErrorMessage } from "@/lib/format";
import * as alertsService from "../services/alerts-service";
import type { DecisionRequest, Report } from "../schemas/alerts";

export function useAlertQueue(
  status = "",
  country = "",
  page = 1,
  search = "",
) {
  const { week, revision } = useAppContext();
  const loader = useCallback(
    (signal: AbortSignal) => {
      void revision;
      // Sem período processado não há fila (a API exige a semana).
      if (!week)
        return Promise.resolve({ items: [], total: 0, countries: [] });
      return alertsService.fetchAlerts(
        { week, status, country, page, search: search.trim() || undefined },
        signal,
      );
    },
    [week, status, country, page, search, revision],
  );
  return useResource(loader);
}
export function useMonitoring() {
  const { week, revision } = useAppContext();
  return useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
        if (!week) return Promise.resolve(null);
        return alertsService.fetchMonitoring(week, signal);
      },
      [week, revision],
    ),
  );
}
export function useAlertDetail(id: string) {
  const { revision, refresh } = useAppContext();
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        void revision;
        const [detail, graph] = await Promise.all([
          alertsService.fetchAlertDetail(id, signal),
          alertsService.fetchAlertGraph(id, signal),
        ]);
        const [report, accountAlerts] = await Promise.all([
          detail.status === "reported"
            ? alertsService.fetchReport(id, signal)
            : Promise.resolve<Report | null>(null),
          fetchAccountAlerts(detail.account, signal),
        ]);
        return {
          detail,
          graph,
          report,
          otherAlerts: accountAlerts.items.filter((item) => item.id !== id),
        };
      },
      [id, revision],
    ),
  );
  const [busy, setBusy] = useState(false);
  async function runAction(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      notify.success(message);
      refresh();
      resource.reload();
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return {
    ...resource,
    busy,
    generateAssessment: () =>
      runAction(
        () => alertsService.generateAssessment(id),
        "Parecer gerado para revisão.",
      ),
    submitDecision: (decision: DecisionRequest) =>
      runAction(
        () => alertsService.submitDecision(id, decision),
        "Decisão registrada.",
      ),
    approveReport: (content: string) =>
      runAction(
        () => alertsService.approveReport(id, content),
        "Rascunho aprovado. Nenhum envio externo foi realizado.",
      ),
  };
}
export function useReplay() {
  const { week, setWeek, refresh, nextRelease } = useAppContext();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    // Sem semana processada aguardando, o replay responderia 409: o botão fica desligado.
    nextRelease,
    advance: async () => {
      setBusy(true);
      try {
        const result = await alertsService.advanceWeek(week);
        setWeek(result.week);
        refresh();
        notify.success(result.alerts_generated + " alertas na nova semana.");
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
