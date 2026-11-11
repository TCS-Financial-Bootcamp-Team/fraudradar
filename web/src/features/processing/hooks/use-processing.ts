"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";
import type {
  Job,
  ProcessingSettingsUpdate,
  SimulationRequest,
} from "../schemas/processing";
import * as service from "../services/processing-service";

export function useProcessing() {
  const { dataset, revision, refresh } = useAppContext();
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        void revision;
        const [settings, jobs] = await Promise.all([
          service.fetchProcessingSettings(signal),
          service.fetchJobs(dataset, signal),
        ]);
        return { settings, jobs };
      },
      [dataset, revision],
    ),
  );
  const [job, setJob] = useState<Job | null>(null);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const running = resource.data?.jobs.find(
    (item) => item.status === "queued" || item.status === "running",
  );
  const activeJobId = pollingId ?? running?.id ?? null;
  const reload = resource.reload;

  useEffect(() => {
    if (!activeJobId) return;
    const controller = new AbortController();
    service
      .pollJob(activeJobId, {
        signal: controller.signal,
        onUpdate: setJob,
      })
      .then((finished) => {
        if (finished.status === "done") notify.success(finished.message ?? "Trabalho concluído.");
        else notify.error(finished.message ?? "O trabalho falhou.");
        setPollingId((current) => (current === activeJobId ? null : current));
        refresh();
        reload();
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          notify.error(getErrorMessage(error));
          setPollingId(null);
        }
      });
    return () => controller.abort();
  }, [activeJobId, refresh, reload]);

  async function start(action: () => Promise<Job>) {
    try {
      const created = await action();
      setJob(created);
      setPollingId(created.id);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  }

  return {
    ...resource,
    job: job ?? running ?? null,
    busy: activeJobId !== null,
    processNow: () => start(() => service.enqueueProcess(dataset)),
    simulate: (request: SimulationRequest) =>
      start(() => service.enqueueSimulation(dataset, request)),
    saveSettings: async (update: ProcessingSettingsUpdate) => {
      try {
        await service.saveProcessingSettings(update);
        notify.success("Configuração de processamento salva.");
        resource.reload();
      } catch (error) {
        notify.error(getErrorMessage(error));
      }
    },
  };
}
