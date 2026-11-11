import { apiGet, USE_MOCKS } from "@/lib/api";
import { datasetsSchema } from "../schemas/datasets";

export async function fetchDatasets(signal?: AbortSignal) {
  if (USE_MOCKS)
    return datasetsSchema.parse((await import("./mocks")).datasetsMock);
  return datasetsSchema.parse(await apiGet("/datasets", { signal }));
}
