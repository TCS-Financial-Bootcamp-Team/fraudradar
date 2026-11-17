"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import { useJob } from "@/features/jobs/hooks/use-job";
import { useJobMessage } from "@/features/jobs/hooks/use-job-message";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";
import * as modelsService from "../services/models-service";
import type { TrainRequest } from "../schemas/models";

const POLL_MS = 3000;

export function useModels() {
  const t = useTranslations("models.toast");
  const jobMessage = useJobMessage();
  const { dataset, refresh } = useAppContext();
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => modelsService.fetchModels(dataset, signal),
      [dataset],
    ),
    { resetKey: dataset },
  );
  const { reload } = resource;
  const [busy, setBusy] = useState(false);

  // Sem treino próprio acompanhado, retoma o que já estava em andamento (outra aba, outro
  // analista); ao fim, recarrega as versões.
  const tracking = useJob({
    resume: resource.data?.training_job ?? null,
    intervalMs: POLL_MS,
    onFinished: (finished) => {
      if (finished.status === "done") notify.success(t("trainDone"));
      else notify.error(jobMessage(finished) ?? t("trainFailed"));
      reload();
    },
  });
  const { track } = tracking;

  const train = useCallback(
    async (options?: TrainRequest) => {
    setBusy(true);
    try {
      track(await modelsService.startTraining(dataset, options));
      notify.info(
        options?.use_feedback
          ? t("queuedFeedback")
          : t("queued"),
      );
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setBusy(false);
      reload();
    }
    },
    [dataset, reload, track, t],
  );

  const promote = useCallback(
    async (version: string) => {
      setBusy(true);
      try {
        await modelsService.promoteModel(dataset, version);
        notify.success(t("promoted", { version }));
        refresh();
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setBusy(false);
        reload();
      }
    },
    [dataset, reload, refresh, t],
  );

  return { ...resource, job: tracking.job, busy, train, promote };
}
