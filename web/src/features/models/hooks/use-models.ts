"use client";

import { useCallback, useState } from "react";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { useJob } from "@/features/jobs/hooks/use-job";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";
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
  const [busy, setBusy] = useState(false);

  // Sem treino próprio acompanhado, retoma o que já estava em andamento (outra aba, outro
  // analista); ao fim, recarrega as versões.
  const tracking = useJob({
    resume: resource.data?.training_job ?? null,
    intervalMs: POLL_MS,
    onFinished: (finished) => {
      if (finished.status === "done") notify.success("Treino concluído.");
      else notify.error(finished.message ?? "O treino falhou.");
      reload();
    },
  });
  const { track } = tracking;

  const train = useCallback(async () => {
    setBusy(true);
    try {
      track(await modelsService.startTraining(dataset));
      notify.info("Treino enfileirado.");
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setBusy(false);
      reload();
    }
  }, [dataset, reload, track]);

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

  return { ...resource, job: tracking.job, busy, train, promote };
}
