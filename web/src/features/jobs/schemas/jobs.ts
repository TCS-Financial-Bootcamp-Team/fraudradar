import { z } from "zod";

// Espelha JobResponse de api/schemas/datasets.py: um só tipo de trabalho para importação,
// processamento, simulação e treino.
export const jobSchema = z.object({
  id: z.string(),
  kind: z.enum(["import", "process", "simulate", "train"]),
  dataset: z.string(),
  status: z.enum(["queued", "running", "done", "failed"]),
  progress: z.number().int().min(0).max(100),
  message: z.string().nullable(),
  // Código estável e parâmetros da mensagem: o front traduz por eles e cai em `message`
  // (português) quando o código não é conhecido.
  message_code: z.string().nullish(),
  message_params: z.record(z.string(), z.unknown()).nullish(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export const jobsSchema = z.array(jobSchema);

export type Job = z.infer<typeof jobSchema>;

export const jobIsOpen = (job: Pick<Job, "status">) =>
  job.status === "queued" || job.status === "running";
