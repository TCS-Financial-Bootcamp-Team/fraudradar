"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { signIn, signOut, signUp } from "../services/auth";
export function useAuth() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function login(form: FormData) {
    setBusy(true);
    try {
      const credentials = z
        .object({ email: z.email(), password: z.string().min(1) })
        .parse({ email: form.get("email"), password: form.get("password") });
      await signIn(credentials.email, credentials.password, form.get("keepSignedIn") === "on");
      router.replace("/");
      router.refresh();
    } catch (e) {
      toast.error(
        e instanceof z.ZodError
          ? "Informe um e-mail válido e sua senha."
          : e instanceof Error
            ? e.message
            : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signup(form: FormData) {
    setBusy(true);
    try {
      if (await signUp(Object.fromEntries(form))) {
        router.replace("/");
        router.refresh();
      } else
        setMessage("Confira seu e-mail para confirmar o cadastro. Depois, entre com sua conta.");
    } catch (e) {
      toast.error(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : "Não foi possível criar a conta.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sair.");
    }
  }
  return { login, signup, logout, busy, message };
}
