import { supabaseBrowser } from "@/lib/supabase/browser";
import { setPersistence } from "@/lib/supabase/persistence";
import { signupSchema } from "../schemas/signup";
export async function signIn(email: string, password: string, persistent = true) {
  setPersistence(persistent);
  const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
  if (error) throw new Error("E-mail ou senha inválidos. Confira os dados e tente novamente.");
}
export async function signUp(input: unknown) {
  const parsed = signupSchema.parse(input);
  setPersistence(true);
  const { data, error } = await supabaseBrowser().auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: { data: { name: parsed.name } },
  });
  if (error) throw new Error("Não foi possível criar a conta. Confira os dados e tente novamente.");
  return !!data.session;
}
export async function signOut() {
  const { error } = await supabaseBrowser().auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
}
