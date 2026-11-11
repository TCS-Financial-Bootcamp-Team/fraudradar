import { getCurrentDataset } from "@/lib/dataset";
import type {
  Job,
  ProcessingSettings,
  ProcessingSettingsUpdate,
  SimulationRequest,
} from "../schemas/processing";

const settings = new Map<string, ProcessingSettings>();
const jobs = new Map<string, Job & { checks: number }>();
let nextJobId = 1;

export function processingSettingsMock(): ProcessingSettings {
  const dataset = getCurrentDataset();
  const existing = settings.get(dataset);
  if (existing) return existing;
  const value = {
    dataset,
    interval_minutes: 60,
    enabled: true,
    demo_mode: false,
    last_run_at: "2026-11-11T12:00:00Z",
    next_run_at: "2026-11-11T13:00:00Z",
  };
  settings.set(dataset, value);
  return value;
}

export function saveProcessingSettingsMock(
  update: ProcessingSettingsUpdate,
): ProcessingSettings {
  const value = {
    ...processingSettingsMock(),
    ...update,
    next_run_at: new Date(Date.now() + update.interval_minutes * 60_000).toISOString(),
  };
  settings.set(value.dataset, value);
  return value;
}

function createJob(kind: Job["kind"]): Job {
  const now = new Date().toISOString();
  const job: Job & { checks: number } = {
    id: String(nextJobId++),
    kind,
    dataset: getCurrentDataset(),
    status: "queued",
    progress: 0,
    message: "Trabalho enfileirado.",
    created_at: now,
    started_at: null,
    finished_at: null,
    checks: 0,
  };
  jobs.set(job.id, job);
  return job;
}

export function enqueueProcessMock() {
  return createJob("process");
}

export function enqueueSimulationMock(request: SimulationRequest) {
  void request;
  return createJob("simulate");
}

export function listJobsMock(): Job[] {
  return [...jobs.values()]
    .filter((job) => job.dataset === getCurrentDataset())
    .sort((a, b) => Number(b.id) - Number(a.id));
}

export function jobMock(id: string): Job {
  const job = jobs.get(id);
  if (!job) throw new Error("Trabalho não encontrado.");
  job.checks += 1;
  if (job.checks === 1) {
    job.status = "running";
    job.progress = 35;
    job.message = "Processando transações.";
    job.started_at = new Date().toISOString();
  } else if (job.checks === 2) {
    job.progress = 80;
    job.message = "Atualizando os alertas.";
  } else {
    job.status = "done";
    job.progress = 100;
    job.message = "Trabalho concluído.";
    job.finished_at = new Date().toISOString();
  }
  return { ...job };
}
