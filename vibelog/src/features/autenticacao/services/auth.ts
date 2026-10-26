import { supabaseBrowser } from "@/lib/supabase/browser";
export async function entrar(email: string, password: string) {
  const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
  if (error) throw new Error("E-mail ou senha inválidos. Confira os dados e tente novamente.");
}
export async function sair() {
  const { error } = await supabaseBrowser().auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
}
