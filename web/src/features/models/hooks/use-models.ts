"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";
import { jobIsOpen, type Job } from "../schemas/models";
import * as modelsService from "../services/models-service";

const POLL_MS = 3000;

export function useModels() {
  const { dataset, refresh } = useAppContext();
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => modelsService.fetchModels(dataset, signal),
      [dataset],
    ),
  );
  const { reload } = resource;
  const [tracked, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);

  // Sem treino próprio acompanhado, retoma o que já estava em andamento (outra aba, outro
  // analista).
  const job = tracked ?? resource.data?.training_job ?? null;

  // Acompanha o trabalho pelo GET /jobs/{id} até terminar; ao fim recarrega as versões.
  const jobId = job && jobIsOpen(job) ? job.id : null;
  const finished = useRef<string | null>(null);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      modelsService
        .fetchJob(jobId, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setJob(next);
          if (jobIsOpen(next) || finished.current === next.id) return;
          finished.current = next.id;
          if (next.status === "done") notify.success("Treino concluído.");
          else notify.error(next.message ?? "O treino falhou.");
          reload();
        })
        .catch(() => undefined); // uma falha de rede passageira não interrompe o acompanhamento
    }, POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [jobId, reload]);

  const train = useCallback(async () => {
    setBusy(true);
    try {
      setJob(await modelsService.startTraining(dataset));
      notify.info("Treino enfileirado.");
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setBusy(false);
      reload();
    }
  }, [dataset, reload]);

  const promote = useCallback(
    async (version: string) => {
      setBusy(true);
      try {
        await modelsService.promoteModel(dataset, version);
        notify.success(`Versão ${version} promovida.`);
        refresh();
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setBusy(false);
        reload();
      }
    },
    [dataset, reload, refresh],
  );

  return { ...resource, job, busy, train, promote };
}
