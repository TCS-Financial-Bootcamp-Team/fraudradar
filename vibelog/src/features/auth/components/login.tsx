"use client";
import { GitBranch, ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/providers";
import { useAuth } from "../hooks/use-auth";
import Link from "next/link";
import { PasswordField } from "@/components/ui/password-field";
export function Login({ signup = false }: { signup?: boolean }) {
  const { login, signup: createAccount, busy, message } = useAuth();
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
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <LockKeyhole className="mb-6 text-primary" size={28} />
          <p className="eyebrow">ACESSO DA EQUIPE</p>
          <h2>{signup ? "Crie sua conta" : "Entre na história"}</h2>
          <p className="mb-8 text-muted-foreground">Use a mesma conta do FraudRadar.</p>
          {message ? (
            <p role="status" className="notice">
              {message}
            </p>
          ) : (
            <form action={signup ? createAccount : login} className="grid gap-4">
              {signup && (
                <label>
                  Nome
                  <input
                    className="field mt-2"
                    name="name"
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
                <PasswordField
                  name="password"
                  required
                  minLength={signup ? 8 : 1}
                  maxLength={128}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder="Sua senha"
                />
              </label>
              {signup ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Use 8 ou mais caracteres, incluindo letras e números.
                  </p>
                  <label>
                    Confirmar senha
                    <PasswordField name="confirmation" required autoComplete="new-password" />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="keepSignedIn" defaultChecked />
                    Manter conectado
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Seu navegador pode oferecer salvar a senha. Sem manter conectado, a sessão dura
                    até fechar o navegador.
                  </p>
                </>
              )}
              <Button type="submit" disabled={busy} className="mt-3">
                {busy ? "Aguarde…" : signup ? "Criar conta" : "Acessar VibeLog"}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          <p className="mt-5 text-sm">
            <Link className="text-primary hover:underline" href={signup ? "/login" : "/signup"}>
              {signup ? "Já tenho conta · Entrar" : "Criar conta"}
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
