"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Radar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/campo";
import { CampoSenha } from "@/components/ui/campo-senha";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  configuracaoSupabase,
  mensagemConfiguracao,
} from "@/lib/supabase/config";
import { useAutenticacao } from "../hooks/use-autenticacao";
import {
  cadastroSchema,
  loginSchema,
  recuperarSchema,
  redefinirSchema,
  type Cadastro,
  type Login,
} from "../schemas/autenticacao";

type Modo = "login" | "cadastro" | "recuperar" | "redefinir";
function FormLogin() {
  const auth = useAutenticacao();
  const [manter, setManter] = useState(true);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Login>({ resolver: zodResolver(loginSchema) });
  return (
    <form
      className="grid gap-5"
      onSubmit={handleSubmit((dados) =>
        auth.entrar({ ...dados, manterConectado: manter }),
      )}
    >
      <Campo nome="E-mail" erro={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Campo>
      <Campo nome="Senha" erro={errors.senha?.message}>
        <CampoSenha autoComplete="current-password" {...register("senha")} />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={manter}
          onChange={(e) => setManter(e.target.checked)}
        />{" "}
        Manter conectado
      </label>
      <p className="text-xs text-muted-foreground">
        Seu navegador pode oferecer salvar a senha. Sem manter conectado, a
        sessão dura até fechar o navegador.
      </p>
      <Link
        className="text-right text-sm text-primary hover:underline"
        href="/recuperar-senha"
      >
        Esqueci a senha
      </Link>
      <Button type="submit" className="h-11" disabled={auth.ocupado}>
        {auth.ocupado ? "Entrando…" : "Acessar plataforma"}
        <ArrowRight />
      </Button>
    </form>
  );
}
function FormCadastro() {
  const auth = useAutenticacao();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Cadastro>({ resolver: zodResolver(cadastroSchema) });
  if (auth.mensagem)
    return (
      <p role="status" className="notice">
        {auth.mensagem}
      </p>
    );
  return (
    <form className="grid gap-4" onSubmit={handleSubmit(auth.cadastrar)}>
      <Campo nome="Nome completo" erro={errors.nome?.message}>
        <Input autoComplete="name" {...register("nome")} />
      </Campo>
      <Campo nome="E-mail" erro={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Campo>
      <Campo nome="Senha" erro={errors.senha?.message}>
        <CampoSenha autoComplete="new-password" {...register("senha")} />
      </Campo>
      <p className="text-xs text-muted-foreground">
        Use 8 ou mais caracteres, incluindo letras e números. Prefira uma frase
        longa e única.
      </p>
      <Campo nome="Confirmar senha" erro={errors.confirmacao?.message}>
        <CampoSenha autoComplete="new-password" {...register("confirmacao")} />
      </Campo>
      <Button type="submit" className="h-11" disabled={auth.ocupado}>
        {auth.ocupado ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
function FormRecuperar() {
  const auth = useAutenticacao();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({ resolver: zodResolver(recuperarSchema) });
  return auth.mensagem ? (
    <p role="status" className="notice">
      {auth.mensagem}
    </p>
  ) : (
    <form className="grid gap-5" onSubmit={handleSubmit(auth.recuperar)}>
      <Campo nome="E-mail da conta" erro={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Campo>
      <Button type="submit" disabled={auth.ocupado}>
        {auth.ocupado ? "Enviando…" : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
function FormRedefinir() {
  const auth = useAutenticacao();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ senha: string; confirmacao: string }>({
    resolver: zodResolver(redefinirSchema),
  });
  return (
    <form className="grid gap-5" onSubmit={handleSubmit(auth.redefinir)}>
      <Campo nome="Nova senha" erro={errors.senha?.message}>
        <CampoSenha autoComplete="new-password" {...register("senha")} />
      </Campo>
      <Campo nome="Confirmar nova senha" erro={errors.confirmacao?.message}>
        <CampoSenha autoComplete="new-password" {...register("confirmacao")} />
      </Campo>
      <Button type="submit" disabled={auth.ocupado}>
        {auth.ocupado ? "Salvando…" : "Atualizar senha"}
      </Button>
    </form>
  );
}
const titulos: Record<Modo, string> = {
  login: "Bem-vindo ao seu radar.",
  cadastro: "Comece uma análise melhor.",
  recuperar: "Recupere seu acesso.",
  redefinir: "Defina uma nova senha.",
};
export function TelaAutenticacao({
  modo,
  erro,
}: {
  modo: Modo;
  erro?: string;
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
            {titulos[modo]}
          </h2>
          <p className="mb-8 text-sm text-muted-foreground">
            {modo === "login"
              ? "Acesse sua fila de análise e acompanhe cada decisão."
              : "Sua conta conecta você ao ambiente de análise."}
          </p>
          {erro && (
            <p role="alert" className="notice mb-6">
              O link expirou ou a sessão não pôde ser validada. Tente entrar ou
              solicite um novo e-mail.
            </p>
          )}
          {!configuracaoSupabase() ? (
            <div role="status" className="notice">
              <strong className="mb-2 block">Configure a autenticação</strong>
              {mensagemConfiguracao}
            </div>
          ) : modo === "login" ? (
            <FormLogin />
          ) : modo === "cadastro" ? (
            <FormCadastro />
          ) : modo === "recuperar" ? (
            <FormRecuperar />
          ) : (
            <FormRedefinir />
          )}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {modo === "login" ? (
              <>
                Ainda não tem conta?{" "}
                <Link
                  className="font-medium text-primary hover:underline"
                  href="/cadastro"
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
