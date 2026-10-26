"use client";
import { GitBranch, ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tema } from "@/components/providers";
import { useAuth } from "../hooks/use-auth";
export function Login() {
  const { login, ocupado } = useAuth();
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
          <h2>Entre na história</h2>
          <p className="mb-8 text-muted-foreground">Use a mesma conta do FraudRadar.</p>
          <form action={login} className="grid gap-4">
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
              <input
                className="campo mt-2"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Sua senha"
              />
            </label>
            <Button type="submit" disabled={ocupado} className="mt-3">
              {ocupado ? "Entrando…" : "Acessar VibeLog"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Um registro para explorar. Os agentes registram o trabalho; a equipe acompanha cada
            conexão.
          </p>
        </div>
      </section>
    </main>
  );
}
