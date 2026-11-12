import { z } from "zod";

export const datasetSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1),
  origin: z.enum(["saml-d", "external"]),
  active_model_version: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export const datasetsSchema = z.array(datasetSchema);

export type Dataset = z.infer<typeof datasetSchema>;
