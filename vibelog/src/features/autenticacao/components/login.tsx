"use client";
import { GitBranch, ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tema } from "@/components/providers";
import { useAuth } from "../hooks/use-auth";
import Link from "next/link";
import { CampoSenha } from "@/components/ui/campo-senha";
export function Login({ cadastro = false }: { cadastro?: boolean }) {
  const { login, cadastro: criarConta, ocupado, mensagem } = useAuth();
  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="brand">
          <GitBranch /> VibeLog <span>/ FraudRadar</span>
        </div>
        <div>
          <p className="eyebrow">DO PRIMEIRO PROMPT À ENTREGA</p>
          <h1>
            Todo resultado
            <br />
            tem uma história.
          </h1>
          <p>Explore as conversas, decisões e evidências que construíram o FraudRadar.</p>
          <div className="sample-path">
            <span>Prompt humano</span>
            <i />
            <span>Delegação à IA</span>
            <i />
            <span>Resultado + evidência</span>
          </div>
        </div>
        <small>Bootcamp IA Aplicada · Registro de construção</small>
      </section>
      <section className="login-form">
        <div className="absolute right-6 top-6">
          <Tema />
        </div>
        <div className="w-full max-w-sm">
          <LockKeyhole className="mb-6 text-primary" size={28} />
          <p className="eyebrow">ACESSO DA EQUIPE</p>
          <h2>{cadastro ? "Crie sua conta" : "Entre na história"}</h2>
          <p className="mb-8 text-muted-foreground">Use a mesma conta do FraudRadar.</p>
          {mensagem ? (
            <p role="status" className="notice">
              {mensagem}
            </p>
          ) : (
            <form action={cadastro ? criarConta : login} className="grid gap-4">
              {cadastro && (
                <label>
                  Nome
                  <input
                    className="campo mt-2"
                    name="nome"
                    required
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                  />
                </label>
              )}
              <label>
                E-mail
                <input
                  className="campo mt-2"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@equipe.com"
                />
              </label>
              <label>
                Senha
                <CampoSenha
                  name="senha"
                  required
                  minLength={cadastro ? 8 : 1}
                  maxLength={128}
                  autoComplete={cadastro ? "new-password" : "current-password"}
                  placeholder="Sua senha"
                />
              </label>
              {cadastro ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Use 8 ou mais caracteres, incluindo letras e números.
                  </p>
                  <label>
                    Confirmar senha
                    <CampoSenha name="confirmacao" required autoComplete="new-password" />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="manterConectado" defaultChecked />
                    Manter conectado
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Seu navegador pode oferecer salvar a senha. Sem manter conectado, a sessão dura
                    até fechar o navegador.
                  </p>
                </>
              )}
              <Button type="submit" disabled={ocupado} className="mt-3">
                {ocupado ? "Aguarde…" : cadastro ? "Criar conta" : "Acessar VibeLog"}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          <p className="mt-5 text-sm">
            <Link className="text-primary hover:underline" href={cadastro ? "/login" : "/cadastro"}>
              {cadastro ? "Já tenho conta · Entrar" : "Criar conta"}
            </Link>
          </p>
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Um registro para explorar. Os agentes registram o trabalho; a equipe acompanha cada
            conexão.
          </p>
        </div>
      </section>
    </main>
  );
}
