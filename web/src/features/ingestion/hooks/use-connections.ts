"use client";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useResource } from "@/hooks/use-resource";
import { useJobMessage } from "@/features/jobs/hooks/use-job-message";
import { useJob } from "@/features/jobs/hooks/use-job";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";
import * as ingestionService from "../services/ingestion-service";
import type {
  CompatibilityReport,
  Connection,
  ConnectionForm,
  ImportRequest,
} from "../schemas/ingestion";

const POLL_MS = 1500;

// Os erros da API chegam explicados (`detail` em português, ou traduzidos por `code`): a tela só os mostra.
export function useConnections() {
  const t = useTranslations("ingestion.connections");
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
      notify.success(t("saved"));
      resource.reload();
      return created;
    } catch (e) {
      setError(getErrorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function remove(connection: Connection): Promise<boolean> {
    setBusy(true);
    try {
      await ingestionService.deleteConnection(connection.id);
      notify.success(t("removed", { name: connection.name }));
      resource.reload();
      return true;
    } catch (e) {
      notify.error(getErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { ...resource, busy, createError: error, create, remove };
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
      setError(getErrorMessage(e));
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

// Acompanha o trabalho de importação (GET /jobs/{id}, hook compartilhado) até terminar.
export function useImportJob(onFinished: () => void) {
  const t = useTranslations("ingestion.connections");
  const jobMessage = useJobMessage();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [failure, setFailure] = useState("");
  const tracking = useJob({
    intervalMs: POLL_MS,
    onFinished: (finished) => {
      if (finished.status === "done")
        notify.success(t("importDone"));
      else setFailure(jobMessage(finished) ?? t("importFailed"));
      onFinished();
    },
  });
  const { track, reset: resetTracking } = tracking;
  async function start(id: string, request: ImportRequest) {
    setStarting(true);
    setStartError("");
    setFailure("");
    try {
      const response = await ingestionService.startImport(id, request);
      track(response.job);
      onFinished();
      return true;
    } catch (e) {
      setStartError(getErrorMessage(e));
      return false;
    } finally {
      setStarting(false);
    }
  }
  function reset() {
    resetTracking();
    setStartError("");
    setFailure("");
  }
  return {
    job: tracking.job,
    starting,
    error: startError || failure || tracking.error,
    start,
    reset,
  };
}
