import { z } from "zod";

// Espelha api/schemas/saude.py.
export const saudeSchema = z.object({
  status: z.enum(["ok", "degradado"]),
  banco: z.object({ ok: z.boolean(), detalhe: z.string() }),
  modelo: z.object({ ok: z.boolean(), arquivo: z.string() }),
  llm: z.object({ ok: z.boolean(), provedor: z.string() }),
});
export type Saude = z.infer<typeof saudeSchema>;
