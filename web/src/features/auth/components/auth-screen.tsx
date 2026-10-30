"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Radar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSupabaseConfig, supabaseConfigMessage } from "@/lib/supabase/config";
import { useAuth } from "../hooks/use-auth";
import {
  signupSchema,
  loginSchema,
  resetRequestSchema,
  passwordUpdateSchema,
  type SignupInput,
  type LoginInput,
} from "../schemas/auth";

type AuthMode = "login" | "signup" | "reset" | "update";
function LoginForm() {
  const auth = useAuth();
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  return (
    <form
      className="grid gap-5"
      onSubmit={handleSubmit((data) =>
        auth.signIn({ ...data, keepSignedIn }),
      )}
    >
      <Field label="E-mail" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Field>
      <Field label="Senha" error={errors.password?.message}>
        <PasswordField
          autoComplete="current-password"
          {...register("password")}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={keepSignedIn}
          onChange={(e) => setKeepSignedIn(e.target.checked)}
        />{" "}
        Manter conectado
      </label>
      <p className="text-xs text-muted-foreground">
        Seu navegador pode oferecer salvar a senha. Sem manter conectado, a
        sessão dura até fechar o navegador.
      </p>
      <Link
        className="text-right text-sm text-primary hover:underline"
        href="/reset-password"
      >
        Esqueci a senha
      </Link>
      <Button type="submit" className="h-11" disabled={auth.busy}>
        {auth.busy ? "Entrando…" : "Acessar plataforma"}
        <ArrowRight />
      </Button>
    </form>
  );
}
function SignupForm() {
  const auth = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });
  if (auth.message)
    return (
      <p role="status" className="notice">
        {auth.message}
      </p>
    );
  return (
    <form className="grid gap-4" onSubmit={handleSubmit(auth.signUp)}>
      <Field label="Nome completo" error={errors.name?.message}>
        <Input autoComplete="name" {...register("name")} />
      </Field>
      <Field label="E-mail" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Field>
      <Field label="Senha" error={errors.password?.message}>
        <PasswordField autoComplete="new-password" {...register("password")} />
      </Field>
      <p className="text-xs text-muted-foreground">
        Use 8 ou mais caracteres, incluindo letras e números. Prefira uma frase
        longa e única.
      </p>
      <Field label="Confirmar senha" error={errors.confirmation?.message}>
        <PasswordField
          autoComplete="new-password"
          {...register("confirmation")}
        />
      </Field>
      <Button type="submit" className="h-11" disabled={auth.busy}>
        {auth.busy ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
function ResetPasswordForm() {
  const auth = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({
    resolver: zodResolver(resetRequestSchema),
  });
  return auth.message ? (
    <p role="status" className="notice">
      {auth.message}
    </p>
  ) : (
    <form
      className="grid gap-5"
      onSubmit={handleSubmit(auth.requestPasswordReset)}
    >
      <Field label="E-mail da conta" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Field>
      <Button type="submit" disabled={auth.busy}>
        {auth.busy ? "Enviando…" : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
function UpdatePasswordForm() {
  const auth = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string; confirmation: string }>({
    resolver: zodResolver(passwordUpdateSchema),
  });
  return (
    <form className="grid gap-5" onSubmit={handleSubmit(auth.updatePassword)}>
      <Field label="Nova senha" error={errors.password?.message}>
        <PasswordField autoComplete="new-password" {...register("password")} />
      </Field>
      <Field label="Confirmar nova senha" error={errors.confirmation?.message}>
        <PasswordField
          autoComplete="new-password"
          {...register("confirmation")}
        />
      </Field>
      <Button type="submit" disabled={auth.busy}>
        {auth.busy ? "Salvando…" : "Atualizar senha"}
      </Button>
    </form>
  );
}
const modeHeadings: Record<AuthMode, string> = {
  login: "Bem-vindo ao seu radar.",
  signup: "Comece uma análise melhor.",
  reset: "Recupere seu acesso.",
  update: "Defina uma nova senha.",
};
export function AuthScreen({
  mode,
  error,
}: {
  mode: AuthMode;
  error?: string;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <Link
          href="/login"
          className="flex items-center gap-3 text-xl font-semibold"
        >
          <Radar className="size-8" />
          FraudRadar<span className="text-xs opacity-60">PLD</span>
        </Link>
        <div className="relative z-10 max-w-lg">
          <p className="eyebrow mb-6 text-inherit opacity-60">
            Inteligência para a integridade financeira
          </p>
          <h1 className="text-4xl font-medium leading-tight tracking-tight xl:text-5xl">
            Encontre o sinal.
            <br />
            <span className="text-[var(--brand-accent)]">Entenda o risco.</span>
          </h1>
          <p className="mt-6 max-w-sm leading-relaxed opacity-70">
            De transações a decisões fundamentadas. Um espaço para investigar
            conexões e agir com confiança.
          </p>
          <div className="radar-art" aria-hidden="true">
            <Radar />
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs opacity-60">
          <ShieldCheck className="size-4" />
          Ambiente de pesquisa · SAML-D
        </p>
      </section>
      <section className="relative flex min-h-dvh items-center justify-center p-6 sm:p-12">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm py-12">
          <div className="mb-10 flex items-center gap-2 font-semibold lg:hidden">
            <Radar className="text-primary" />
            FraudRadar PLD
          </div>
          <p className="eyebrow mb-3">Monitoramento antilavagem</p>
          <h2 className="mb-3 text-3xl font-semibold tracking-tight">
            {modeHeadings[mode]}
          </h2>
          <p className="mb-8 text-sm text-muted-foreground">
            {mode === "login"
              ? "Acesse sua fila de análise e acompanhe cada decisão."
              : "Sua conta conecta você ao ambiente de análise."}
          </p>
          {error && (
            <p role="alert" className="notice mb-6">
              O link expirou ou a sessão não pôde ser validada. Tente entrar ou
              solicite um novo e-mail.
            </p>
          )}
          {!getSupabaseConfig() ? (
            <div role="status" className="notice">
              <strong className="mb-2 block">Configure a autenticação</strong>
              {supabaseConfigMessage}
            </div>
          ) : mode === "login" ? (
            <LoginForm />
          ) : mode === "signup" ? (
            <SignupForm />
          ) : mode === "reset" ? (
            <ResetPasswordForm />
          ) : (
            <UpdatePasswordForm />
          )}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Ainda não tem conta?{" "}
                <Link
                  className="font-medium text-primary hover:underline"
                  href="/signup"
                >
                  Cadastre-se
                </Link>
              </>
            ) : (
              <Link className="text-primary hover:underline" href="/login">
                Voltar para o login
              </Link>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
