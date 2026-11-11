"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/format";
import { jobIsOpen, type Job } from "../schemas/jobs";
import * as jobsService from "../services/jobs-service";

const DEFAULT_POLL_MS = 2000;

interface Options {
  // Trabalho já em andamento que veio da listagem (outra aba, outro analista).
  resume?: Job | null;
  intervalMs?: number;
  // Chamado uma vez quando o trabalho acompanhado termina (done ou failed).
  onFinished?: (job: Job) => void;
}

// Acompanha um trabalho pelo GET /jobs/{id} até terminar. Uma falha de rede passageira não
// interrompe o acompanhamento: o erro aparece e a próxima consulta tenta de novo.
export function useJob({
  resume = null,
  intervalMs = DEFAULT_POLL_MS,
  onFinished,
}: Options = {}) {
  const [tracked, setTracked] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const finishedRef = useRef(onFinished);
  const notified = useRef<string | null>(null);
  useEffect(() => {
    finishedRef.current = onFinished;
  });

  // Uma cópia velha do trabalho que acabou de terminar não volta a ser acompanhada.
  const fallback = resume && resume.id !== tracked?.id ? resume : null;
  const job =
    tracked && jobIsOpen(tracked)
      ? tracked
      : fallback && jobIsOpen(fallback)
        ? fallback
        : (tracked ?? fallback);
  const jobId = job && jobIsOpen(job) ? job.id : null;

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await jobsService.fetchJob(jobId, controller.signal);
        if (controller.signal.aborted) return;
        setError("");
        setTracked(next);
        if (!jobIsOpen(next)) {
          if (notified.current !== next.id) {
            notified.current = next.id;
            finishedRef.current?.(next);
          }
          return;
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(getErrorMessage(e));
      }
      timer = setTimeout(() => void poll(), intervalMs);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, intervalMs]);

  const track = useCallback((next: Job) => {
    setError("");
    setTracked(next);
  }, []);
  const reset = useCallback(() => {
    setTracked(null);
    setError("");
  }, []);

  return { job, error, track, reset, open: jobId !== null };
}
