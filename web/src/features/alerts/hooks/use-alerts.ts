"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
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
  origin = "",
) {
  const { week, revision } = useAppContext();
  const loader = useCallback(
    (signal: AbortSignal) => {
      void revision;
      // Sem período processado não há fila (a API exige a semana).
      if (!week)
        return Promise.resolve({ items: [], total: 0, countries: [] });
      return alertsService.fetchAlerts(
        {
          week,
          status,
          country,
          page,
          search: search.trim() || undefined,
          origin: origin || undefined,
        },
        signal,
      );
    },
    [week, status, country, page, search, origin, revision],
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
  const t = useTranslations("alerts.detail.toast");
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
    { resetKey: id },
  );
  const [busyAction, setBusyAction] = useState<
    "assessment" | "decision" | "approve" | null
  >(null);
  async function runAction(
    kind: "assessment" | "decision" | "approve",
    action: () => Promise<unknown>,
    message: string,
  ) {
    setBusyAction(kind);
    try {
      await action();
      notify.success(message);
      refresh();
      resource.reload();
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }
  return {
    ...resource,
    busy: busyAction !== null,
    generatingAssessment: busyAction === "assessment",
    generateAssessment: () =>
      runAction(
        "assessment",
        () => alertsService.generateAssessment(id),
        t("assessment"),
      ),
    submitDecision: (decision: DecisionRequest) =>
      runAction(
        "decision",
        () => alertsService.submitDecision(id, decision),
        t("decision"),
      ),
    approveReport: (content: string) =>
      runAction(
        "approve",
        () => alertsService.approveReport(id, content),
        t("approved"),
      ),
  };
}
export function useReplay() {
  const t = useTranslations("alerts.detail.toast");
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
        notify.success(t("newWeek", { count: result.alerts_generated }));
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
