import { getCurrentDataset } from "@/lib/dataset";
import { createJobMock } from "@/features/jobs/services/mocks";
import type {
  ProcessingSettings,
  ProcessingSettingsUpdate,
  SimulationRequest,
} from "../schemas/processing";

const settings = new Map<string, ProcessingSettings>();

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

export function enqueueProcessMock() {
  return createJobMock("process");
}

export function enqueueSimulationMock(request: SimulationRequest) {
  void request;
  return createJobMock("simulate");
}
