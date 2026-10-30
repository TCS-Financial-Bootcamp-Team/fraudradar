import { z } from "zod";

// Espelha api/schemas/health.py.
export const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.object({ ok: z.boolean(), detail: z.string() }),
  model: z.object({ ok: z.boolean(), file: z.string() }),
  llm: z.object({ ok: z.boolean(), provider: z.string() }),
});
export type Health = z.infer<typeof healthSchema>;
