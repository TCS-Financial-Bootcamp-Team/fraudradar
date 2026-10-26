import { apiGet, USA_MOCKS } from "@/lib/api";

import { saudeSchema, type Saude } from "../schemas/saude";

export async function buscarSaude(signal?: AbortSignal): Promise<Saude> {
  if (USA_MOCKS) return saudeSchema.parse((await import("./mocks")).saudeMock);
  return saudeSchema.parse(await apiGet("/saude", { signal }));
}
