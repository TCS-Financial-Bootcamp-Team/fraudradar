"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AppContextProvider, useAppContext } from "@/components/app-context";
import { SidePanel } from "@/components/ui/side-panel";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { AssistantDrawer } from "@/features/assistant/components/assistant";
import { useAlertQueue } from "@/features/alerts/hooks/use-alerts";
import { USE_MOCKS } from "@/lib/api";
import { useFormatters } from "@/i18n/use-formatters";
import { formatQueuePosition, formatScore } from "@/lib/risk";
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
  const t = useTranslations("shell");
  const locale = useLocale();
  const format = useFormatters();
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarOpen);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { dataset, datasets, week, weeksLoading, weeksError, reloadWeeks } =
    useAppContext();
  const datasetName =
    datasets.find((item) => item.slug === dataset)?.name ?? "SAML-D";
  const queue = useAlertQueue("pending");
  const pendingCount = queue.data?.total ?? 0;

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

  const toggleAssistant = useCallback(() => {
    setNotificationsOpen(false);
    setIsMobileMenuOpen(false);
    setIsAssistantOpen((open) => !open);
  }, []);

  const openNotifications = useCallback(() => {
    setIsAssistantOpen(false);
    setNotificationsOpen(true);
  }, []);

  return (
    <div
      data-app-shell
      className="flex h-dvh w-full items-start overflow-hidden bg-background text-foreground"
    >
      <style>{`
        @keyframes assistant-drawer-in {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (min-width: 640px) {
          body:has([data-assistant-drawer="open"])
            section[data-toast-region][aria-live="polite"]:has(> .toast) {
            right: 420px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-assistant-drawer="open"] { animation: none !important; }
        }
      `}</style>

      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform duration-200 focus:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("skipToContent")}
      </a>

      <Sidebar
        id={SIDEBAR_ID}
        isOpen={isSidebarOpen}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={closeMobileMenu}
        pendingCount={pendingCount}
      />

      <div className="relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          sidebarId={SIDEBAR_ID}
          isSidebarOpen={isSidebarOpen}
          isMobileMenuOpen={isMobileMenuOpen}
          isAssistantOpen={isAssistantOpen}
          pendingCount={pendingCount}
          onToggleSidebar={toggleSidebar}
          onMobileMenuToggle={toggleMobileMenu}
          onToggleAssistant={toggleAssistant}
          onOpenNotifications={openNotifications}
        />

        {USE_MOCKS && (
          <div className="shrink-0 border-b border-border bg-soft px-4 py-2 text-center text-[11px] text-muted-foreground">
            {t("demoBanner")}
          </div>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-y-auto outline-none"
        >
          <div className="mx-auto grid w-full max-w-[1320px] gap-9 px-[clamp(16px,3.5vw,48px)] pb-16 pt-9">
            {weeksLoading ? (
              <LoadingState />
            ) : weeksError ? (
              <ResourceError message={weeksError} onRetry={reloadWeeks} />
            ) : (
              children
            )}
          </div>
          <footer className="mx-auto w-full max-w-[1320px] px-[clamp(16px,3.5vw,48px)] pb-6 text-[11px] text-muted-foreground">
            {week
              ? t("brand.footerWeek", {
                  dataset: datasetName,
                  week: format.shortDate(week),
                })
              : t("brand.footer", { dataset: datasetName })}
          </footer>
        </main>
      </div>

      <AssistantDrawer
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
      />

      {notificationsOpen && (
        <SidePanel
          title={t("notifications.title")}
          onClose={() => setNotificationsOpen(false)}
        >
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm text-muted-foreground">
              {t("notifications.intro")}
            </p>
            {queue.loading ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("notifications.loading")}
              </p>
            ) : queue.error ? (
              <div role="alert" className="rounded-xl border border-border p-4">
                <p className="text-sm text-foreground">{queue.error}</p>
                <button
                  type="button"
                  onClick={queue.reload}
                  className="mt-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("notifications.retry")}
                </button>
              </div>
            ) : queue.data?.items.length ? (
              <div className="flex flex-col gap-2">
                {queue.data.items.slice(0, 5).map((alert) => (
                  <Link
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded-xl border border-border bg-card p-4 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={alert.id}
                    href={`/alerts/${alert.id}`}
                  >
                    <strong className="font-mono text-sm font-medium text-foreground">
                      {t("notifications.alert", { id: alert.id })}
                    </strong>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("notifications.alertMeta", {
                        typology: alert.typology,
                        score: formatScore(alert.score, locale),
                        position: formatQueuePosition(
                          alert.queue_position,
                          locale,
                        ),
                      })}
                    </p>
                  </Link>
                ))}
                {pendingCount > 5 && (
                  <Link
                    href="/alerts"
                    onClick={() => setNotificationsOpen(false)}
                    className="mt-1 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("notifications.seeAll", { count: pendingCount })}
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground">
                {t("notifications.none")}
              </p>
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
