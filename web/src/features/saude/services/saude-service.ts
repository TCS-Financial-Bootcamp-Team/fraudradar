import { apiGet } from "@/lib/api";

import type { Saude } from "../schemas/saude";

export function buscarSaude(signal?: AbortSignal): Promise<Saude> {
  return apiGet<Saude>("/saude", { signal });
}
