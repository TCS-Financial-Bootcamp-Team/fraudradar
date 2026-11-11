import { apiGet, USE_MOCKS } from "@/lib/api";
import { jobSchema, jobsSchema, jobIsOpen, type Job } from "../schemas/jobs";

export async function fetchJob(id: string, signal?: AbortSignal) {
  return jobSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).jobMock(id)
      : await apiGet("/jobs/" + encodeURIComponent(id), { signal }),
  );
}

export async function fetchJobs(dataset: string, signal?: AbortSignal) {
  return jobsSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).listJobsMock(dataset)
      : await apiGet("/jobs?dataset=" + encodeURIComponent(dataset), {
          signal,
        }),
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

// Consulta o trabalho até ele terminar (done ou failed).
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
    if (!jobIsOpen(job)) return job;
    await wait(intervalMs, options.signal);
  }
}
