import { supabaseBrowser } from "@/lib/supabase/browser";
import { definirPersistencia } from "@/lib/supabase/persistencia";
import { cadastroSchema } from "../schemas/cadastro";
export async function entrar(email: string, password: string, persistente = true) {
  definirPersistencia(persistente);
  const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
  if (error) throw new Error("E-mail ou senha inválidos. Confira os dados e tente novamente.");
}
export async function cadastrar(dados: unknown) {
  const d = cadastroSchema.parse(dados);
  definirPersistencia(true);
  const { data, error } = await supabaseBrowser().auth.signUp({
    email: d.email,
    password: d.senha,
    options: { data: { nome: d.nome } },
  });
  if (error) throw new Error("Não foi possível criar a conta. Confira os dados e tente novamente.");
  return !!data.session;
}
export async function sair() {
  const { error } = await supabaseBrowser().auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
}
