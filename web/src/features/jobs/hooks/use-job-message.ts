"use client";

import { useCallback } from "react";
import { useServerMessage } from "@/i18n/server-messages";
import type { Job } from "../schemas/jobs";

type JobText = Pick<Job, "message" | "message_code" | "message_params">;

// Mensagem do trabalho no idioma ativo: traduz por `message_code` + `message_params` e, se o
// código for desconhecido (ou ausente), mostra o texto em português que o servidor mandou.
export function useJobMessage() {
  const serverMessage = useServerMessage();
  return useCallback(
    (job: JobText | null | undefined): string | null =>
      job
        ? serverMessage(job.message_code, job.message_params, job.message)
        : null,
    [serverMessage],
  );
}
