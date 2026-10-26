import { clienteSupabase } from "@/lib/supabase/client";
import {
  cadastroSchema,
  loginSchema,
  perfilSchema,
  redefinirSchema,
  recuperarSchema,
  type Login,
  type Cadastro,
  type Perfil,
} from "../schemas/autenticacao";

export async function entrar(dados: Login) {
  const d = loginSchema.parse(dados);
  const { error } = await clienteSupabase().auth.signInWithPassword({
    email: d.email,
    password: d.senha,
  });
  if (error)
    throw new Error("Não foi possível entrar. Verifique seu e-mail e senha.");
}
export async function cadastrar(dados: Cadastro) {
  const d = cadastroSchema.parse(dados);
  const { error, data } = await clienteSupabase().auth.signUp({
    email: d.email,
    password: d.senha,
    options: {
      data: { nome: d.nome },
      emailRedirectTo: window.location.origin + "/auth/callback",
    },
  });
  if (error)
    throw new Error(
      "Não foi possível criar a conta. Verifique os dados e tente novamente.",
    );
  return Boolean(data.session);
}
export async function recuperar(dados: { email: string }) {
  const d = recuperarSchema.parse(dados);
  const { error } = await clienteSupabase().auth.resetPasswordForEmail(
    d.email,
    { redirectTo: window.location.origin + "/auth/callback?destino=recuperar" },
  );
  if (error)
    throw new Error(
      "Não foi possível solicitar a recuperação. Tente novamente.",
    );
}
export async function redefinir(dados: { senha: string; confirmacao: string }) {
  const d = redefinirSchema.parse(dados);
  const { error } = await clienteSupabase().auth.updateUser({
    password: d.senha,
  });
  if (error)
    throw new Error(
      "Link inválido ou expirado. Solicite outro e-mail de recuperação.",
    );
}
export async function sair() {
  const { error } = await clienteSupabase().auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
}
export async function buscarPerfil() {
  const { data, error } = await clienteSupabase().auth.getUser();
  if (error || !data.user)
    throw new Error("Sessão indisponível. Entre novamente.");
  return {
    nome: String(data.user.user_metadata.nome ?? ""),
    email: data.user.email ?? "",
  };
}
export async function salvarPerfil(dados: Perfil) {
  const { error } = await clienteSupabase().auth.updateUser({
    data: perfilSchema.parse(dados),
  });
  if (error) throw new Error("Não foi possível salvar o perfil.");
}
