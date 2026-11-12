import { getCurrentDataset } from "@/lib/dataset";
import type { Job } from "../schemas/jobs";

// Registro único de trabalhos de demonstração, usado por importação, processamento,
// simulação e treino. Cada consulta avança o trabalho um passo.
interface Entry {
  job: Job;
  checks: number;
  onDone?: () => void;
}

const entries = new Map<string, Entry>();
let nextJobId = 1;

export function createJobMock(
  kind: Job["kind"],
  options: { dataset?: string; onDone?: () => void } = {},
): Job {
  const job: Job = {
    id: String(nextJobId++),
    kind,
    dataset: options.dataset ?? getCurrentDataset(),
    status: "queued",
    progress: 0,
    message: "Trabalho enfileirado.",
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
  };
  entries.set(job.id, { job, checks: 0, onDone: options.onDone });
  return { ...job };
}

export function listJobsMock(dataset: string): Job[] {
  return [...entries.values()]
    .map((entry) => entry.job)
    .filter((job) => job.dataset === dataset)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((job) => ({ ...job }));
}

export function jobMock(id: string): Job {
  const entry = entries.get(id);
  if (!entry) throw new Error("Trabalho não encontrado.");
  entry.checks += 1;
  const { job } = entry;
  if (entry.checks === 1) {
    job.status = "running";
    job.progress = 35;
    job.message = "Processando transações.";
    job.started_at = new Date().toISOString();
  } else if (entry.checks === 2) {
    job.progress = 80;
    job.message = "Atualizando os alertas.";
  } else if (job.status !== "done") {
    job.status = "done";
    job.progress = 100;
    job.message = "Trabalho concluído.";
    job.finished_at = new Date().toISOString();
    entry.onDone?.();
  }
  return { ...job };
}
