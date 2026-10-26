"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { entrar, sair, cadastrar } from "../services/auth";
export function useAuth() {
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const router = useRouter();
  async function login(form: FormData) {
    setOcupado(true);
    try {
      const dados = z
        .object({ email: z.email(), senha: z.string().min(1) })
        .parse({ email: form.get("email"), senha: form.get("senha") });
      await entrar(dados.email, dados.senha, form.get("manterConectado") === "on");
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
      setOcupado(false);
    }
  }
  async function cadastro(form: FormData) {
    setOcupado(true);
    try {
      if (await cadastrar(Object.fromEntries(form))) {
        router.replace("/");
        router.refresh();
      } else
        setMensagem("Confira seu e-mail para confirmar o cadastro. Depois, entre com sua conta.");
    } catch (e) {
      toast.error(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : "Não foi possível criar a conta.",
      );
    } finally {
      setOcupado(false);
    }
  }
  async function logout() {
    try {
      await sair();
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sair.");
    }
  }
  return { login, cadastro, logout, ocupado, mensagem };
}
