import { z } from "zod";

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
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM ou HH:MM:SS."),
    Date: z.iso.date("Informe uma data válida."),
    Sender_account: z
      .string()
      .trim()
      .min(1, "Informe a conta de origem.")
      .max(64),
    Receiver_account: z
      .string()
      .trim()
      .min(1, "Informe a conta de destino.")
      .max(64),
    Amount: z.number().finite().positive("O valor deve ser maior que zero."),
    // Preserva códigos ISO e nomes do arquivo de origem; a API normaliza o catálogo.
    Payment_currency: z.string().trim().min(2, "Informe a moeda.").max(40),
    Received_currency: z.string().trim().min(2, "Informe a moeda.").max(40),
    Sender_bank_location: z
      .string()
      .trim()
      .min(2, "Informe o país de origem.")
      .max(80),
    Receiver_bank_location: z
      .string()
      .trim()
      .min(2, "Informe o país de destino.")
      .max(80),
    Payment_type: z
      .string()
      .trim()
      .min(2, "Informe o meio de pagamento.")
      .max(80),
  })
  .strict();
export const csvHeaders = Object.keys(transactionSchema.shape);
export const connectionSchema = z
  .object({
    name: z.string().trim().min(2, "Informe um nome.").max(100),
    type: z.literal("postgres"),
    connection_string: z
      .string()
      .min(1, "Informe a conexão.")
      .max(4000)
      .refine((v) => {
        try {
          const u = new URL(v);
          return (
            ["postgres:", "postgresql:"].includes(u.protocol) &&
            Boolean(u.hostname && u.pathname.length > 1 && u.username)
          );
        } catch {
          return false;
        }
      }, "Use uma URI Postgres válida com host, banco e usuário."),
    ssl: z.boolean(),
  })
  .strict();
export const dataSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal("postgres"),
  masked_host: z.string(),
  masked_database: z.string(),
  status: z.enum(["connected", "syncing", "error"]),
  last_synced_at: z.string().nullable(),
});
export const dataSourcesSchema = z.object({
  items: z.array(dataSourceSchema),
});
export const receiptSchema = z.object({
  id: z.string(),
  status: z.enum(["received", "processing", "completed"]),
  message: z.string(),
});
export type TransactionRequest = z.infer<typeof transactionSchema>;
export type ConnectionRequest = z.infer<typeof connectionSchema>;
export type DataSource = z.infer<typeof dataSourceSchema>;
export type DataSources = z.infer<typeof dataSourcesSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type CsvPreview = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
};
