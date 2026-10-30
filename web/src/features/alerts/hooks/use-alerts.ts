"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { getErrorMessage } from "@/lib/format";
import * as alertsService from "../services/alerts-service";
import type { DecisionRequest } from "../schemas/alerts";

export function useAlertQueue(status = "", country = "", page = 1) {
  const { week, revision } = useAppContext();
  const loader = useCallback(
    (signal: AbortSignal) => {
      void revision;
      return alertsService.fetchAlerts(
        { week, status, country, page },
        signal,
      );
    },
    [week, status, country, page, revision],
  );
  return useResource(loader);
}
export function useMonitoring() {
  const { week, revision } = useAppContext();
  return useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
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
        return { detail, graph };
      },
      [id, revision],
    ),
  );
  const [busy, setBusy] = useState(false);
  async function runAction(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      refresh();
      resource.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
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
  };
}
export function useReplay() {
  const { week, setWeek, refresh } = useAppContext();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    advance: async () => {
      setBusy(true);
      try {
        const result = await alertsService.advanceWeek(week);
        setWeek(result.week);
        refresh();
        toast.success(result.alerts_generated + " alertas na nova semana.");
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
export function useReports() {
  const { week, revision, refresh } = useAppContext();
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
        return alertsService.listReports(week, signal);
      },
      [week, revision],
    ),
  );
  const [busy, setBusy] = useState(false);
  return {
    ...resource,
    busy,
    approve: async (id: string, content: string) => {
      setBusy(true);
      try {
        await alertsService.approveReport(id, content);
        toast.success("Rascunho aprovado. Nenhum envio externo foi realizado.");
        refresh();
        resource.reload();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
  };
}
