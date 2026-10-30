import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo.").max(100),
});
const passwordRule = z
  .string()
  .min(8, "Use pelo menos 8 caracteres.")
  .max(128)
  .regex(/[A-Za-z]/, "Inclua uma letra.")
  .regex(/\d/, "Inclua um número.");
export const loginSchema = z.object({
  keepSignedIn: z.boolean().optional(),
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});
export const signupSchema = loginSchema
  .extend({
    name: profileSchema.shape.name,
    password: passwordRule,
    confirmation: z.string(),
  })
  .refine((d) => d.password === d.confirmation, {
    path: ["confirmation"],
    message: "As senhas não coincidem.",
  });
export const resetRequestSchema = z.object({ email: loginSchema.shape.email });
export const passwordUpdateSchema = z
  .object({ password: passwordRule, confirmation: z.string() })
  .refine((d) => d.password === d.confirmation, {
    path: ["confirmation"],
    message: "As senhas não coincidem.",
  });
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type Profile = z.infer<typeof profileSchema>;
