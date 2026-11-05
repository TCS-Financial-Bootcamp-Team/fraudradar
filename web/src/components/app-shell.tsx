"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { AppContextProvider, useAppContext } from "@/components/app-context";
import { SidePanel } from "@/components/ui/side-panel";
import { FloatingAssistant } from "@/features/assistant/components/assistant";
import { useAlertQueue } from "@/features/alerts/hooks/use-alerts";
import { USE_MOCKS } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { persistSidebarState } from "@/lib/sidebar";
import { Header } from "./layout/header";
import { SIDEBAR_ID, Sidebar } from "./layout/sidebar";

interface AppShellProps {
  children: React.ReactNode;
  initialSidebarOpen?: boolean;
}

function ShellContent({
  children,
  initialSidebarOpen = true,
}: {
  children: React.ReactNode;
  initialSidebarOpen?: boolean;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarOpen);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const pathname = usePathname();
  const { week } = useAppContext();
  const queue = useAlertQueue("pending");

  // Fecha o menu mobile ao trocar de rota sem passe de render extra.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((open) => {
      const next = !open;
      persistSidebarState(next);
      return next;
    });
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((open) => !open);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  return (
    <div
      data-app-shell
      className="flex h-dvh w-full overflow-hidden bg-background text-foreground"
    >
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[200] -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform duration-200 focus:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Pular para o conteúdo
      </a>

      <Sidebar
        id={SIDEBAR_ID}
        isOpen={isSidebarOpen}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={closeMobileMenu}
      />

      <div className="relative flex flex-1 flex-col overflow-hidden min-w-0 w-full">
        <Header
          sidebarId={SIDEBAR_ID}
          isSidebarOpen={isSidebarOpen}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleSidebar={toggleSidebar}
          onMobileMenuToggle={toggleMobileMenu}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />

        {USE_MOCKS && (
          <div className="shrink-0 border-b bg-accent px-4 py-2 text-center text-[11px] text-accent-foreground">
            Ambiente demonstrativo · dados simulados · nenhuma comunicação é
            enviada
          </div>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto min-w-0 outline-none"
        >
          <div className="mx-auto grid max-w-[1600px] w-full min-w-0 gap-7 p-4 pb-12 sm:p-8 sm:pb-16">
            {children}
          </div>
          <footer className="mx-auto max-w-[1600px] w-full px-4 pb-6 sm:px-8 text-[10px] text-muted-foreground">
            FraudRadar PLD · SAML-D · Semana de {formatShortDate(week)}
          </footer>
        </main>
      </div>

      <FloatingAssistant />

      {notificationsOpen && (
        <SidePanel
          title="Notificações"
          onClose={() => setNotificationsOpen(false)}
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Alertas pendentes na semana selecionada.
            </p>
            {queue.loading ? (
              <p role="status">Carregando…</p>
            ) : queue.error ? (
              <p role="alert">{queue.error}</p>
            ) : queue.data?.items.length ? (
              queue.data.items.slice(0, 5).map((alert) => (
                <Link
                  onClick={() => setNotificationsOpen(false)}
                  className="block rounded-lg border p-4 text-sm hover:bg-muted"
                  key={alert.id}
                  href={"/alerts/" + alert.id}
                >
                  <strong>{alert.id}</strong>
                  <p className="mt-1 text-muted-foreground">
                    {alert.typology} · Score {alert.score}
                  </p>
                </Link>
              ))
            ) : (
              <p>Nenhum alerta pendente.</p>
            )}
          </div>
        </SidePanel>
      )}
    </div>
  );
}

export function AppShell({
  children,
  initialSidebarOpen = true,
}: AppShellProps) {
  return (
    <AppContextProvider>
      <ShellContent initialSidebarOpen={initialSidebarOpen}>
        {children}
      </ShellContent>
    </AppContextProvider>
  );
}
