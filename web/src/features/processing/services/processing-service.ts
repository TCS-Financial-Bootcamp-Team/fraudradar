import { apiGet, apiPost, apiPut, USE_MOCKS } from "@/lib/api";
import { jobSchema } from "@/features/jobs/schemas/jobs";
import {
  processingSettingsSchema,
  processingSettingsUpdateSchema,
  simulationRequestSchema,
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
