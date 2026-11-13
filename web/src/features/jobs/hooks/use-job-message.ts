"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { Job } from "../schemas/jobs";

type JobText = Pick<Job, "message" | "message_code" | "message_params">;

// Mensagem do trabalho no idioma ativo: traduz por `message_code` + `message_params` e, se o
// código for desconhecido (ou ausente), mostra o texto em português que o servidor mandou.
export function useJobMessage() {
  const t = useTranslations("jobs.messages");
  return useCallback(
    (job: JobText | null | undefined): string | null => {
      if (!job) return null;
      const code = job.message_code;
      if (code && t.has(code as never)) {
        return t(code as never, (job.message_params ?? {}) as never);
      }
      return job.message ?? null;
    },
    [t],
  );
}
