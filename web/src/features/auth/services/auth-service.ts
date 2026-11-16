import { getT } from "@/i18n/runtime";
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
    throw new Error(getT("auth.errors")("signIn"));
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
      getT("auth.errors")("signUp"),
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
      getT("auth.errors")("reset"),
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
      getT("auth.errors")("invalidLink"),
    );
}
export async function signOut() {
  const { error } = await createSupabaseBrowserClient().auth.signOut();
  if (error) throw new Error(getT("auth.errors")("signOut"));
}
export async function fetchProfile() {
  const { data, error } = await createSupabaseBrowserClient().auth.getUser();
  if (error || !data.user)
    throw new Error(getT("auth.errors")("noSession"));
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
  if (error) throw new Error(getT("auth.errors")("saveProfile"));
}
