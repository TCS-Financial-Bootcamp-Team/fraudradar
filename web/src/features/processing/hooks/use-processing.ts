"use client";

import { useCallback } from "react";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { useJob } from "@/features/jobs/hooks/use-job";
import * as jobsService from "@/features/jobs/services/jobs-service";
import { jobIsOpen, type Job } from "@/features/jobs/schemas/jobs";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";
import type {
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
          jobsService.fetchJobs(dataset, signal),
        ]);
        return { settings, jobs };
      },
      [dataset, revision],
    ),
  );
  const reload = resource.reload;
  const running = resource.data?.jobs.find(jobIsOpen) ?? null;
  const tracking = useJob({
    resume: running,
    onFinished: (finished) => {
      if (finished.status === "done")
        notify.success(finished.message ?? "Trabalho concluído.");
      else notify.error(finished.message ?? "O trabalho falhou.");
      refresh();
      reload();
    },
  });

  async function start(action: () => Promise<Job>) {
    try {
      tracking.track(await action());
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  }

  return {
    ...resource,
    job: tracking.job,
    busy: tracking.open,
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
