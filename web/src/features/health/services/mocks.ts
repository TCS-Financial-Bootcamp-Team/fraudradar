import type { Health } from "../schemas/health";
export const healthMock: Health = {
  status: "ok",
  database: { ok: true, detail: "Demonstração" },
  model: { ok: true, file: "LightGBM · simulado" },
  llm: { ok: true, provider: "Respostas simuladas" },
};
