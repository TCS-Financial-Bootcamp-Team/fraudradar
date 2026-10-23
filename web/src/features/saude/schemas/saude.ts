// Espelha api/schemas/saude.py
export type Saude = {
  status: "ok" | "degradado";
  banco: { ok: boolean; detalhe: string };
  modelo: { ok: boolean; arquivo: string };
  llm: { ok: boolean; provedor: string };
};
