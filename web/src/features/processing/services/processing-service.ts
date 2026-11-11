import { apiGet, apiPost, apiPut, USE_MOCKS } from "@/lib/api";
import {
  jobSchema,
  jobsSchema,
  processingSettingsSchema,
  processingSettingsUpdateSchema,
  simulationRequestSchema,
  type Job,
  type ProcessingSettingsUpdate,
  type SimulationRequest,
} from "../schemas/processing";

export async function fetchProcessingSettings(signal?: AbortSignal) {
  return processingSettingsSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).processingSettingsMock()
      : await apiGet("/processing/settings", { signal }),
  );
}

export async function saveProcessingSettings(
  update: ProcessingSettingsUpdate,
) {
  const parsed = processingSettingsUpdateSchema.parse(update);
  return processingSettingsSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).saveProcessingSettingsMock(parsed)
      : await apiPut("/processing/settings", parsed),
  );
}

export async function fetchJobs(dataset: string, signal?: AbortSignal) {
  return jobsSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).listJobsMock()
      : await apiGet("/jobs?dataset=" + encodeURIComponent(dataset), { signal }),
  );
}

export async function fetchJob(id: string, signal?: AbortSignal) {
  return jobSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).jobMock(id)
      : await apiGet("/jobs/" + encodeURIComponent(id), { signal }),
  );
}

export async function enqueueProcess(dataset: string) {
  return jobSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).enqueueProcessMock()
      : await apiPost("/datasets/" + encodeURIComponent(dataset) + "/process", {}),
  );
}

export async function enqueueSimulation(
  dataset: string,
  request: SimulationRequest,
) {
  const parsed = simulationRequestSchema.parse(request);
  return jobSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).enqueueSimulationMock(parsed)
      : await apiPost(
          "/datasets/" + encodeURIComponent(dataset) + "/simulate",
          parsed,
        ),
  );
}

function wait(intervalMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Consulta cancelada", "AbortError"));
    const timer = setTimeout(resolve, intervalMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Consulta cancelada", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function pollJob(
  id: string,
  options: {
    signal?: AbortSignal;
    intervalMs?: number;
    onUpdate?: (job: Job) => void;
  } = {},
): Promise<Job> {
  const intervalMs = options.intervalMs ?? 2000;
  for (;;) {
    const job = await fetchJob(id, options.signal);
    options.onUpdate?.(job);
    if (job.status === "done" || job.status === "failed") return job;
    await wait(intervalMs, options.signal);
  }
}
