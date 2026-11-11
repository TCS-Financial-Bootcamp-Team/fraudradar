import { z } from "zod";

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

export type ProcessingSettings = z.infer<typeof processingSettingsSchema>;
export type ProcessingSettingsUpdate = z.infer<
  typeof processingSettingsUpdateSchema
>;
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
