import { apiGet, apiPost, USE_MOCKS } from "@/lib/api";
import { jobSchema } from "@/features/jobs/schemas/jobs";
import { modelsSchema } from "../schemas/models";

// O conjunto vai no caminho (não no X-Dataset): são rotas do catálogo global.
const base = (dataset: string) => `/datasets/${encodeURIComponent(dataset)}`;

export async function fetchModels(dataset: string, signal?: AbortSignal) {
  if (USE_MOCKS)
    return modelsSchema.parse((await import("./mocks")).modelsMock);
  return modelsSchema.parse(await apiGet(`${base(dataset)}/models`, { signal }));
}

export async function startTraining(dataset: string) {
  if (USE_MOCKS)
    return jobSchema.parse(
      (await import("@/features/jobs/services/mocks")).createJobMock("train", {
        dataset,
      }),
    );
  return jobSchema.parse(await apiPost(`${base(dataset)}/train`, {}));
}

export async function promoteModel(dataset: string, version: string) {
  if (USE_MOCKS)
    return modelsSchema.parse((await import("./mocks")).modelsMock);
  return modelsSchema.parse(
    await apiPost(
      `${base(dataset)}/models/${encodeURIComponent(version)}/promote`,
      {},
    ),
  );
}
