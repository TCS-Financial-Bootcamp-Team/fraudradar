import type { Health } from "../schemas/health";
export const healthMock: Health = {
  status: "ok",
  database: { ok: true, detail: "Modo offline" },
  model: { ok: true, file: "LightGBM · local" },
  llm: { ok: true, provider: "Modo offline" },
};
