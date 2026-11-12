import { z } from "zod";
import { alertSchema, statusSchema } from "@/features/alerts/schemas/alerts";

export const suspiciousAccountSchema = z.object({
  account: z.string(),
  max_score: z.number().min(0).max(100),
  latest_score: z.number().min(0).max(100),
  alert_weeks: z.number().int().positive(),
  first_week: z.iso.date(),
  last_week: z.iso.date(),
  total_flagged_amount: z.number().nonnegative(),
  country: z.string(),
  status: statusSchema,
  latest_alert_id: z.string(),
});
export const suspiciousAccountsSchema = z.object({
  items: z.array(suspiciousAccountSchema),
  total: z.number().int().nonnegative(),
});
export const accountAlertsSchema = z.object({ items: z.array(alertSchema) });

export type SuspiciousAccount = z.infer<typeof suspiciousAccountSchema>;
export type SuspiciousAccounts = z.infer<typeof suspiciousAccountsSchema>;
export type AccountFilters = {
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  page?: number;
  sort?: "max_score_desc" | "latest_score_desc" | "last_week_desc";
};
