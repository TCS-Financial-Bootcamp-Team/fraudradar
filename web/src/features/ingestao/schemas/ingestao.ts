import { z } from "zod";

export const moedas = [
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
export const paises = [
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
export const meios = [
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
export const transacaoSchema = z
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
export const cabecalhosCsv = Object.keys(transacaoSchema.shape);
export const conexaoSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe um nome.").max(100),
    tipo: z.literal("postgres"),
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
export const fonteSchema = z.object({
  id: z.string(),
  nome: z.string(),
  tipo: z.literal("postgres"),
  host_mascarado: z.string(),
  banco_mascarado: z.string(),
  status: z.enum(["conectada", "sincronizando", "erro"]),
  ultima_sincronizacao: z.string().nullable(),
});
export const fontesSchema = z.object({ itens: z.array(fonteSchema) });
export const reciboSchema = z.object({
  id: z.string(),
  status: z.enum(["recebido", "processando", "concluido"]),
  mensagem: z.string(),
});
export type Transacao = z.infer<typeof transacaoSchema>;
export type Conexao = z.infer<typeof conexaoSchema>;
export type Fonte = z.infer<typeof fonteSchema>;
export type Recibo = z.infer<typeof reciboSchema>;
export type Previa = {
  cabecalhos: string[];
  linhas: Record<string, string>[];
  arquivo: string;
};
