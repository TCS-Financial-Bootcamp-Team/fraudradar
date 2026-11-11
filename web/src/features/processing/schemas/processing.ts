import { z } from "zod";

export const jobSchema = z.object({
  id: z.string(),
  kind: z.enum(["import", "process", "simulate", "train"]),
  dataset: z.string(),
  status: z.enum(["queued", "running", "done", "failed"]),
  progress: z.number().int().min(0).max(100),
  message: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  started_at: z.string().datetime({ offset: true }).nullable(),
  finished_at: z.string().datetime({ offset: true }).nullable(),
});
export const jobsSchema = z.array(jobSchema);

export const processingSettingsUpdateSchema = z.object({
  interval_minutes: z.number().int().min(5).max(1440),
  enabled: z.boolean(),
  demo_mode: z.boolean(),
});
export const processingSettingsSchema = processingSettingsUpdateSchema.extend({
  dataset: z.string(),
  last_run_at: z.string().datetime({ offset: true }).nullable(),
  next_run_at: z.string().datetime({ offset: true }),
});
export const simulationRequestSchema = z.object({
  transactions: z.number().int().min(50).max(5000),
  days: z.number().int().min(1).max(7),
  inject_pattern: z.boolean(),
});

export type Job = z.infer<typeof jobSchema>;
export type ProcessingSettings = z.infer<typeof processingSettingsSchema>;
export type ProcessingSettingsUpdate = z.infer<
  typeof processingSettingsUpdateSchema
>;
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
