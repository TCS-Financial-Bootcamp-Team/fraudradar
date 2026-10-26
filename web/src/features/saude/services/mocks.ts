import type { Saude } from "../schemas/saude";
export const saudeMock: Saude = {
  status: "ok",
  banco: { ok: true, detalhe: "Demonstração" },
  modelo: { ok: true, arquivo: "LightGBM · simulado" },
  llm: { ok: true, provedor: "Respostas simuladas" },
};
