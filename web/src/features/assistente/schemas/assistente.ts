import { z } from "zod";
export const mensagemSchema = z.object({
  papel: z.enum(["usuario", "assistente"]),
  texto: z.string().min(1).max(8000),
});
export const pedidoChatSchema = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  contexto: z.object({
    pagina: z.string(),
    semana: z.string(),
    alerta_id: z.string().optional(),
  }),
  historico: z.array(mensagemSchema).max(20),
});
export const respostaChatSchema = z.object({
  resposta: z.string(),
  fontes: z
    .array(z.object({ titulo: z.string(), trecho: z.string() }))
    .default([]),
});
export type Mensagem = z.infer<typeof mensagemSchema>;
export type PedidoChat = z.infer<typeof pedidoChatSchema>;
