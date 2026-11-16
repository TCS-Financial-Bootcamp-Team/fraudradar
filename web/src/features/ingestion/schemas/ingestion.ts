import { z } from "zod";
import { v } from "@/i18n/validation";
import { jobSchema } from "@/features/jobs/schemas/jobs";

export const currencies = [
  "BRL",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "INR",
  "JPY",
  "ZAR",
  "Euro",
  "UK pounds",
  "US dollar",
  "Rupee",
  "Yen",
  "Yuan",
  "Dirham",
] as const;
export const countries = [
  "Brasil",
  "Brazil",
  "Portugal",
  "UK",
  "United Kingdom",
  "USA",
  "United States",
  "UAE",
  "France",
  "Germany",
  "India",
  "China",
  "Japan",
  "Australia",
  "Canada",
  "South Africa",
  "Switzerland",
  "Netherlands",
  "Spain",
  "Italy",
  "Mexico",
  "Singapore",
  "Saudi Arabia",
] as const;
export const paymentTypes = [
  "Cash Deposit",
  "Cash Withdrawal",
  "Cheque",
  "Credit card",
  "Debit card",
  "Cross-border",
  "ACH",
  "Wire",
  "Transfer",
  "Digital Wallet",
] as const;
export const transactionSchema = z
  .object({
    Time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, v("timeFormat")),
    Date: z.iso.date(v("dateInvalid")),
    Sender_account: z
      .string()
      .trim()
      .min(1, v("senderRequired"))
      .max(64),
    Receiver_account: z
      .string()
      .trim()
      .min(1, v("receiverRequired"))
      .max(64),
    Amount: z.number().finite().positive(v("amountPositive")),
    // Preserva códigos ISO e nomes do arquivo de origem; a API normaliza o catálogo.
    Payment_currency: z.string().trim().min(2, v("currencyRequired")).max(40),
    Received_currency: z.string().trim().min(2, v("currencyRequired")).max(40),
    Sender_bank_location: z
      .string()
      .trim()
      .min(2, v("senderCountry"))
      .max(80),
    Receiver_bank_location: z
      .string()
      .trim()
      .min(2, v("receiverCountry"))
      .max(80),
    Payment_type: z
      .string()
      .trim()
      .min(2, v("paymentTypeRequired"))
      .max(80),
  })
  .strict();
export const csvHeaders = Object.keys(transactionSchema.shape);
// Formulário de nova conexão. A senha só existe aqui e no pedido; nunca volta em resposta.
export const connectionFormSchema = z
  .object({
    name: z.string().trim().min(2, v("nameRequired")).max(100),
    host: z.string().trim().min(1, v("hostRequired")).max(253),
    port: z.coerce
      .number()
      .int(v("portRange"))
      .min(1, v("portRange"))
      .max(65535, v("portRange")),
    database: z.string().trim().min(1, v("databaseRequired")).max(63),
    user: z.string().trim().min(1, v("userRequired")).max(63),
    password: z.string().min(1, v("passwordNeeded")).max(500),
    table: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z_][A-Za-z0-9_]{0,62}(\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/,
        v("tableFormat"),
      ),
    control_column: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z_][A-Za-z0-9_]{0,62}$/,
        v("controlColumnFormat"),
      )
      .or(z.literal("")),
  })
  .strict();
export const connectionStatusSchema = z.enum([
  "untested",
  "connected",
  "incompatible",
  "error",
  "syncing",
]);
export const importModeSchema = z.enum(["history", "follow", "both"]);
export const checkItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["ok", "fail", "info"]),
  detail: z.string(),
  // Código e parâmetros de `detail`: o front traduz por eles (sem código, mostra o detail).
  code: z.string().nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
});
export const compatibilityReportSchema = z.object({
  compatible: z.boolean(),
  checks: z.array(checkItemSchema),
  missing_columns: z.array(z.string()),
  wrong_types: z.array(
    z.object({ column: z.string(), expected: z.string(), found: z.string() }),
  ),
  has_ground_truth: z.boolean(),
  has_typology: z.boolean(),
  row_count: z.number().nullable(),
  date_first: z.string().nullable(),
  date_last: z.string().nullable(),
  sample: z.object({
    size: z.number(),
    valid: z.boolean(),
    errors: z.array(z.record(z.string(), z.unknown())),
  }),
  overlap: z
    .object({
      dataset: z.string(),
      sample_accounts: z.number(),
      known_accounts_pct: z.number().nullable(),
      dates: z.enum([
        "continue",
        "overlap",
        "other_era",
        "empty_dataset",
        "unknown",
      ]),
      dataset_first: z.string().nullable(),
      dataset_last: z.string().nullable(),
    })
    .nullable(),
  suggestion: z
    .object({
      relation: z.enum(["extend", "new_dataset"]).nullable(),
      message: z.string(),
      code: z.string().nullish(),
      params: z.record(z.string(), z.unknown()).nullish(),
    })
    .nullable(),
});
export const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal("postgres"),
  masked_host: z.string(),
  masked_database: z.string(),
  table: z.string(),
  control_column: z.string().nullable(),
  status: connectionStatusSchema,
  last_error: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  dataset: z.string().nullable(),
  mode: importModeSchema.nullable(),
  compatibility: compatibilityReportSchema.nullable(),
});
export const connectionsSchema = z.object({
  items: z.array(connectionSchema),
});
export const importRequestSchema = z
  .object({
    relation: z.enum(["extend", "new_dataset"]),
    new_dataset: z
      .object({
        name: z.string().trim().min(1, v("datasetNameRequired")).max(120),
        slug: z
          .string()
          .regex(
            /^[a-z0-9-]{1,40}$/,
            v("slugFormat"),
          ),
      })
      .strict()
      .optional(),
    mode: importModeSchema,
    control_column: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, v("controlColumnRequired")),
  })
  .strict()
  .refine((v) => (v.relation === "new_dataset") === Boolean(v.new_dataset), {
    message: v("newDatasetOnly"),
    path: ["new_dataset"],
  });
export const importResponseSchema = z.object({
  dataset: z.string(),
  job: jobSchema,
});
export const receiptSchema = z.object({
  id: z.string(),
  status: z.enum(["received", "processing", "completed"]),
  message: z.string(),
  message_code: z.string().nullish(),
  message_params: z.record(z.string(), z.unknown()).nullish(),
});
export type TransactionRequest = z.infer<typeof transactionSchema>;
export type ConnectionForm = z.input<typeof connectionFormSchema>;
export type ConnectionRequest = z.output<typeof connectionFormSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type Connections = z.infer<typeof connectionsSchema>;
export type CompatibilityReport = z.infer<typeof compatibilityReportSchema>;
export type ImportMode = z.infer<typeof importModeSchema>;
export type ImportRequest = z.input<typeof importRequestSchema>;
export type ImportResponse = z.infer<typeof importResponseSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type CsvPreview = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
};
