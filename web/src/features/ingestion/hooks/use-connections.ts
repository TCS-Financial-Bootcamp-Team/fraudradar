"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { notify } from "@/lib/notify";
import { explainApiError } from "../services/connection-model";
import * as ingestionService from "../services/ingestion-service";
import type {
  CompatibilityReport,
  Connection,
  ConnectionForm,
  ImportRequest,
  Job,
} from "../schemas/ingestion";

const POLL_MS = 1500;

export function useConnections() {
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => ingestionService.listConnections(signal),
      [],
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(form: ConnectionForm): Promise<Connection | null> {
    setBusy(true);
    setError("");
    try {
      const created = await ingestionService.createConnection(form);
      notify.success("Conexão salva. A senha foi cifrada e não volta mais.");
      resource.reload();
      return created;
    } catch (e) {
      setError(explainApiError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { ...resource, busy, createError: error, create };
}

export function useConnectionTest(onTested: () => void) {
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  async function run(id: string) {
    setTesting(true);
    setError("");
    setReport(null);
    try {
      setReport(await ingestionService.testConnection(id));
      onTested();
    } catch (e) {
      setError(explainApiError(e));
    } finally {
      setTesting(false);
    }
  }
  function reset() {
    setReport(null);
    setError("");
  }
  return { report, testing, error, run, reset };
}

// Acompanha o trabalho de importação pelo GET /jobs/{id} até terminar.
export function useImportJob(onFinished: () => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  });
  useEffect(() => {
    // Cada resposta é um objeto novo, então o efeito reagenda a próxima consulta.
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const jobId = job.id;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      ingestionService
        .fetchJob(jobId, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setJob(next);
          if (next.status === "done") {
            notify.success(
              "Importação concluída. O processamento foi enfileirado.",
            );
            finishedRef.current();
          } else if (next.status === "failed") {
            setError(next.message ?? "A importação falhou.");
            finishedRef.current();
          }
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(explainApiError(e));
        });
    }, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job]);
  async function start(id: string, request: ImportRequest) {
    setStarting(true);
    setError("");
    try {
      const response = await ingestionService.startImport(id, request);
      setJob(response.job);
      finishedRef.current();
      return true;
    } catch (e) {
      setError(explainApiError(e));
      return false;
    } finally {
      setStarting(false);
    }
  }
  function reset() {
    setJob(null);
    setError("");
  }
  return { job, starting, error, start, reset };
}
