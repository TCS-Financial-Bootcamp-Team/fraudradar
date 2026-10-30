import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setKeepSignedIn } from "@/lib/supabase/persistence";
import {
  signupSchema,
  loginSchema,
  profileSchema,
  passwordUpdateSchema,
  resetRequestSchema,
  type LoginInput,
  type SignupInput,
  type Profile,
} from "../schemas/auth";

export async function signIn(data: LoginInput) {
  const parsed = loginSchema.parse(data);
  setKeepSignedIn(parsed.keepSignedIn !== false);
  const { error } = await createSupabaseBrowserClient().auth.signInWithPassword(
    {
      email: parsed.email,
      password: parsed.password,
    },
  );
  if (error)
    throw new Error("Não foi possível entrar. Verifique seu e-mail e senha.");
}
export async function signUp(data: SignupInput) {
  const parsed = signupSchema.parse(data);
  setKeepSignedIn(true);
  const { error, data: authData } =
    await createSupabaseBrowserClient().auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: {
        data: { name: parsed.name },
        emailRedirectTo: window.location.origin + "/auth/callback",
      },
    });
  if (error)
    throw new Error(
      "Não foi possível criar a conta. Verifique os dados e tente novamente.",
    );
  return Boolean(authData.session);
}
export async function requestPasswordReset(data: { email: string }) {
  const parsed = resetRequestSchema.parse(data);
  const { error } =
    await createSupabaseBrowserClient().auth.resetPasswordForEmail(
      parsed.email,
      {
        redirectTo: window.location.origin + "/auth/callback?next=reset",
      },
    );
  if (error)
    throw new Error(
      "Não foi possível solicitar a recuperação. Tente novamente.",
    );
}
export async function updatePassword(data: {
  password: string;
  confirmation: string;
}) {
  const parsed = passwordUpdateSchema.parse(data);
  const { error } = await createSupabaseBrowserClient().auth.updateUser({
    password: parsed.password,
  });
  if (error)
    throw new Error(
      "Link inválido ou expirado. Solicite outro e-mail de recuperação.",
    );
}
export async function signOut() {
  const { error } = await createSupabaseBrowserClient().auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
}
export async function fetchProfile() {
  const { data, error } = await createSupabaseBrowserClient().auth.getUser();
  if (error || !data.user)
    throw new Error("Sessão indisponível. Entre novamente.");
  return {
    name: String(
      data.user.user_metadata.name ?? data.user.user_metadata.nome ?? "",
    ),
    email: data.user.email ?? "",
  };
}
export async function saveProfile(data: Profile) {
  const { error } = await createSupabaseBrowserClient().auth.updateUser({
    data: profileSchema.parse(data),
  });
  if (error) throw new Error("Não foi possível salvar o perfil.");
}
