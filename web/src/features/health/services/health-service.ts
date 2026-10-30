import { apiGet, USE_MOCKS } from "@/lib/api";

import { healthSchema, type Health } from "../schemas/health";

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  if (USE_MOCKS)
    return healthSchema.parse((await import("./mocks")).healthMock);
  return healthSchema.parse(await apiGet("/health", { signal }));
}
