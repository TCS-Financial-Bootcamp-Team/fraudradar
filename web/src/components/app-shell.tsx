"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  ChevronDown,
  ChevronsLeft,
  Database,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/campo";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContextoApp, useContextoApp } from "@/components/app-context";
import { AssistenteFlutuante } from "@/features/assistente/components/assistente";
import { useAutenticacao } from "@/features/autenticacao/hooks/use-autenticacao";
import { usePerfil } from "@/features/autenticacao/hooks/use-perfil";
import { useFila } from "@/features/alertas/hooks/use-alertas";
import { USA_MOCKS } from "@/lib/api";
import { dataCurta } from "@/lib/formatacao";

const navegacao = [
  { href: "/dashboard", nome: "Visão geral", icone: LayoutDashboard },
  { href: "/alertas", nome: "Fila de alertas", icone: Radar },
  { href: "/comunicacoes", nome: "Comunicações", icone: FileCheck2 },
  { href: "/monitoramento", nome: "Monitoramento", icone: Activity },
  { href: "/ingestao", nome: "Fontes de dados", icone: Database },
];
function Estrutura({ children }: { children: React.ReactNode }) {
  const [recolhida, setRecolhida] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notificacoes, setNotificacoes] = useState(false);
  const caminho = usePathname();
  const { semana, setSemana } = useContextoApp();
  const perfil = usePerfil();
  const auth = useAutenticacao();
  const fila = useFila("pendente");
  return (
    <div
      className={`${recolhida ? "sidebar-small" : ""} ${mobile ? "sidebar-mobile" : ""}`}
    >
      <a
        href="#conteudo"
        className="sr-only fixed z-50 focus:not-sr-only focus:bg-card focus:p-4"
      >
        Pular para o conteúdo
      </a>
      {mobile && (
        <button
          aria-label="Fechar navegação"
          className="fixed inset-0 z-40 bg-foreground/30 md:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className="app-sidebar">
        <div className="flex h-[4.5rem] items-center gap-3 border-b border-sidebar-border px-6">
          <Radar className="size-7 shrink-0 text-[var(--brand-accent)]" />
          <Link
            className="sidebar-label text-lg font-semibold tracking-tight text-white"
            href="/dashboard"
          >
            FraudRadar{" "}
            <span className="text-[10px] font-normal opacity-60">PLD</span>
          </Link>
          <button
            className="ml-auto md:hidden"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-2 pt-8">
          <p className="sidebar-label text-[10px] font-medium uppercase tracking-[.16em] opacity-50">
            Espaço de análise
          </p>
        </div>
        <nav aria-label="Navegação principal" className="space-y-1 p-3">
          {navegacao.map(({ href, nome, icone: Icone }) => (
            <Link
              title={nome}
              key={href}
              href={href}
              onClick={() => setMobile(false)}
              className="nav-item"
              aria-current={caminho.startsWith(href) ? "page" : undefined}
            >
              <Icone className="size-[18px] shrink-0" />
              <span className="sidebar-label">{nome}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-3">
          <div className="sidebar-label m-2 mb-6 rounded-lg border border-sidebar-border p-4">
            <ShieldCheck className="mb-3 size-5 text-[var(--brand-accent)]" />
            <p className="text-xs font-medium">Cada decisão, uma evidência.</p>
            <p className="mt-2 text-[11px] leading-relaxed opacity-60">
              Investigação assistida.
              <br />
              Revisão sempre humana.
            </p>
          </div>
          <Link
            href="/configuracoes"
            className="nav-item"
            title="Configurações"
            aria-current={caminho === "/configuracoes" ? "page" : undefined}
          >
            <Settings2 className="size-[18px]" />
            <span className="sidebar-label">Configurações</span>
          </Link>
          <button
            className="nav-item hidden w-full md:flex"
            onClick={() => setRecolhida(!recolhida)}
            aria-label={recolhida ? "Expandir navegação" : "Recolher navegação"}
          >
            <ChevronsLeft
              className={`size-[18px] ${recolhida ? "rotate-180" : ""}`}
            />
            <span className="sidebar-label">Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </Button>
            <label className="flex items-center gap-3 text-xs">
              <span className="hidden text-muted-foreground lg:inline">
                Semana de referência
              </span>
              <Input
                className="w-[145px] border-0 bg-muted text-xs"
                type="date"
                aria-label="Semana de referência"
                value={semana}
                onChange={(e) => {
                  if (e.target.value) setSemana(e.target.value);
                }}
              />
            </label>
            <div className="hidden items-center gap-2 border-l pl-5 text-xs text-muted-foreground xl:flex">
              <Search className="size-4" />
              <span>Busca global em breve</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir notificações"
              onClick={() => setNotificacoes(true)}
            >
              <Bell />
            </Button>
            <details className="relative">
              <summary
                aria-label="Menu da conta"
                className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-2"
              >
                <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {(perfil.dados?.nome || "A").slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden max-w-28 truncate text-xs lg:block">
                  {perfil.dados?.nome || "Minha conta"}
                </span>
                <ChevronDown className="hidden size-3 sm:block" />
              </summary>
              <div className="absolute right-0 top-12 w-56 rounded-xl border bg-popover p-2 shadow-md">
                <Link
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-muted"
                  href="/configuracoes"
                >
                  Meu perfil
                </Link>
                <Button
                  className="w-full justify-start"
                  variant="ghost"
                  disabled={auth.ocupado}
                  onClick={() => void auth.sair()}
                >
                  <LogOut />
                  Sair da conta
                </Button>
              </div>
            </details>
          </div>
        </header>
        {USA_MOCKS && (
          <div className="border-b bg-accent px-4 py-2 text-center text-[11px] text-accent-foreground">
            Ambiente demonstrativo · dados simulados · nenhuma comunicação é
            enviada
          </div>
        )}
        <main
          id="conteudo"
          className="mx-auto grid max-w-[1600px] gap-7 p-4 pb-28 sm:p-8 sm:pb-28"
        >
          {children}
        </main>
        <footer className="px-8 pb-6 text-[10px] text-muted-foreground">
          FraudRadar PLD · SAML-D · Semana de {dataCurta(semana)}
        </footer>
      </div>
      <AssistenteFlutuante />
      {notificacoes && (
        <PainelLateral
          titulo="Notificações"
          fechar={() => setNotificacoes(false)}
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Alertas pendentes na semana selecionada.
            </p>
            {fila.carregando ? (
              <p role="status">Carregando…</p>
            ) : fila.erro ? (
              <p role="alert">{fila.erro}</p>
            ) : fila.dados?.itens.length ? (
              fila.dados.itens.slice(0, 5).map((a) => (
                <Link
                  onClick={() => setNotificacoes(false)}
                  className="block rounded-lg border p-4 text-sm hover:bg-muted"
                  key={a.id}
                  href={"/alertas/" + a.id}
                >
                  <strong>{a.id}</strong>
                  <p className="mt-1 text-muted-foreground">
                    {a.tipologia} · Score {a.score}
                  </p>
                </Link>
              ))
            ) : (
              <p>Nenhum alerta pendente.</p>
            )}
          </div>
        </PainelLateral>
      )}
    </div>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ContextoApp>
      <Estrutura>{children}</Estrutura>
    </ContextoApp>
  );
}
