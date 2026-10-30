import { z } from "zod";
export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome.").max(100),
    email: z.email("Informe um e-mail válido."),
    password: z
      .string()
      .min(8, "Use pelo menos 8 caracteres.")
      .max(128)
      .regex(/[A-Za-z]/, "Inclua uma letra.")
      .regex(/\d/, "Inclua um número."),
    confirmation: z.string(),
  })
  .refine((d) => d.password === d.confirmation, {
    path: ["confirmation"],
    message: "As senhas não coincidem.",
  });
