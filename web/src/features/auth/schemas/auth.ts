import { z } from "zod";
import { v } from "@/i18n/validation";

export const profileSchema = z.object({
  name: z.string().trim().min(2, v("nameFull")).max(100),
});
const passwordRule = z
  .string()
  .min(8, v("passwordMin"))
  .max(128)
  .regex(/[A-Za-z]/, v("passwordLetter"))
  .regex(/\d/, v("passwordNumber"));
export const loginSchema = z.object({
  keepSignedIn: z.boolean().optional(),
  email: z.email(v("emailInvalid")),
  password: z.string().min(1, v("passwordRequired")),
});
export const signupSchema = loginSchema
  .extend({
    name: profileSchema.shape.name,
    password: passwordRule,
    confirmation: z.string(),
  })
  .refine((d) => d.password === d.confirmation, {
    path: ["confirmation"],
    message: v("passwordMismatch"),
  });
export const resetRequestSchema = z.object({ email: loginSchema.shape.email });
export const passwordUpdateSchema = z
  .object({ password: passwordRule, confirmation: z.string() })
  .refine((d) => d.password === d.confirmation, {
    path: ["confirmation"],
    message: v("passwordMismatch"),
  });
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type Profile = z.infer<typeof profileSchema>;
