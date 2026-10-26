import { z } from "zod";
export const LIMITE_TEXTO_HISTORICO = 8000;
// A mensagem exibida pode incluir uma resposta longa e os títulos das fontes.
export const mensagemSchema = z.object({
  papel: z.enum(["usuario", "assistente"]),
  texto: z.string().min(1),
});
const mensagemHistoricoSchema = mensagemSchema.extend({
  texto: z.string().min(1).max(LIMITE_TEXTO_HISTORICO),
});
export const pedidoChatSchema = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  contexto: z.object({
    pagina: z.string(),
    semana: z.string(),
    alerta_id: z.string().optional(),
  }),
  historico: z.array(mensagemHistoricoSchema).max(20),
});
export const respostaChatSchema = z.object({
  resposta: z.string(),
  fontes: z
    .array(z.object({ titulo: z.string(), trecho: z.string() }))
    .default([]),
});
export type Mensagem = z.infer<typeof mensagemSchema>;
export type PedidoChat = z.infer<typeof pedidoChatSchema>;
