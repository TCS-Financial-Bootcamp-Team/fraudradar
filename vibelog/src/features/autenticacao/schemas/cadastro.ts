import { z } from "zod";
export const cadastroSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome.").max(100),
    email: z.email("Informe um e-mail válido."),
    senha: z
      .string()
      .min(8, "Use pelo menos 8 caracteres.")
      .max(128)
      .regex(/[A-Za-z]/, "Inclua uma letra.")
      .regex(/\d/, "Inclua um número."),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    message: "As senhas não coincidem.",
  });
