import { z } from "zod";

export const perfilSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome completo.").max(100),
});
const senha = z
  .string()
  .min(8, "Use pelo menos 8 caracteres.")
  .max(128)
  .regex(/[A-Za-z]/, "Inclua uma letra.")
  .regex(/\d/, "Inclua um número.");
export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  senha: z.string().min(1, "Informe sua senha."),
});
export const cadastroSchema = loginSchema
  .extend({ nome: perfilSchema.shape.nome, senha, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    message: "As senhas não coincidem.",
  });
export const recuperarSchema = z.object({ email: loginSchema.shape.email });
export const redefinirSchema = z
  .object({ senha, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    message: "As senhas não coincidem.",
  });
export type Login = z.infer<typeof loginSchema>;
export type Cadastro = z.infer<typeof cadastroSchema>;
export type Perfil = z.infer<typeof perfilSchema>;
