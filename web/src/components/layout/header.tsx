"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Bell, Menu, PanelLeft, Palette, Sparkles, X } from "lucide-react";
import { cn } from "cn";
import { AppearancePanel } from "@/components/theme";
import { getBreadcrumb } from "@/lib/sidebar";
import { HeaderAccountMenu } from "./account-menu";
import { SIDEBAR_ID } from "./sidebar";
import { useDismiss } from "./use-dismiss";

const subscribeNoop = () => () => {};

interface HeaderProps {
  isSidebarOpen?: boolean;
  isMobileMenuOpen?: boolean;
  isAssistantOpen?: boolean;
  pendingCount?: number;
  sidebarId?: string;
  onToggleSidebar?: () => void;
  onMobileMenuToggle?: () => void;
  onToggleAssistant: () => void;
  onOpenNotifications: () => void;
}

const TOPBAR_BUTTON =
  "grid size-10 shrink-0 place-items-center rounded-lg text-topbar-muted transition-colors hover:bg-topbar-border hover:text-topbar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-topbar-foreground";

export function Header({
  isSidebarOpen,
  isMobileMenuOpen,
  isAssistantOpen = false,
  pendingCount = 0,
  sidebarId = SIDEBAR_ID,
  onToggleSidebar,
  onMobileMenuToggle,
  onToggleAssistant,
  onOpenNotifications,
}: HeaderProps) {
  const pathname = usePathname();
  const breadcrumb = getBreadcrumb(pathname);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [appearanceTop, setAppearanceTop] = useState(68);
  const [appearanceRight, setAppearanceRight] = useState(16);
  const appearanceTriggerRef = useRef<HTMLButtonElement>(null);
  const appearancePanelRef = useRef<HTMLElement>(null);
  // O popover vai para o <body>: o header é sticky e cria um contexto de
  // empilhamento próprio, então dentro dele o popover nunca passaria o drawer.
  const canPortal = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const updateAppearancePosition = useCallback(() => {
    const rect = appearanceTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAppearanceTop(rect.bottom + 8);
    setAppearanceRight(Math.max(8, window.innerWidth - rect.right));
  }, []);

  useDismiss(
    isAppearanceOpen,
    [appearanceTriggerRef, appearancePanelRef],
    (reason) => {
      setIsAppearanceOpen(false);
      if (reason === "escape") appearanceTriggerRef.current?.focus();
    },
  );

  useEffect(() => {
    if (!isAppearanceOpen) return;
    window.addEventListener("resize", updateAppearancePosition);
    return () => window.removeEventListener("resize", updateAppearancePosition);
  }, [isAppearanceOpen, updateAppearancePosition]);

  return (
    <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-topbar-border bg-topbar px-2 text-topbar-foreground sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cn(TOPBAR_BUTTON, "hidden md:grid")}
            aria-label="Recolher ou expandir menu"
            aria-expanded={isSidebarOpen}
            aria-controls={sidebarId}
          >
            <PanelLeft className="size-[18px]" strokeWidth={1.5} />
          </button>
        )}
        {onMobileMenuToggle && (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className={cn(TOPBAR_BUTTON, "md:hidden")}
            aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={Boolean(isMobileMenuOpen)}
            aria-controls={sidebarId}
          >
            <Menu className="size-[18px]" strokeWidth={1.5} />
          </button>
        )}
        <span
          aria-hidden="true"
          className="hidden h-5 w-px shrink-0 bg-topbar-border sm:block"
        />
        <p className="min-w-0 truncate text-[13px] text-topbar-muted">
          <span className="hidden lg:inline">{breadcrumb.group} / </span>
          <span className="font-medium text-topbar-foreground">
            {breadcrumb.page}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button
          id="assistant-toggle"
          type="button"
          onClick={onToggleAssistant}
          aria-expanded={isAssistantOpen}
          className={cn(
            "mr-0.5 inline-flex h-9 items-center gap-2 rounded-lg border border-topbar-border px-2.5 text-[13px] font-medium text-topbar-foreground transition-colors hover:bg-topbar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-topbar-foreground sm:mr-1.5 sm:px-3",
            isAssistantOpen && "bg-topbar-border",
          )}
        >
          <Sparkles className="size-4" strokeWidth={1.5} />
          <span className="hidden min-[360px]:inline">Assistente</span>
        </button>

        <div className="relative">
          <button
            ref={appearanceTriggerRef}
            type="button"
            onClick={() => {
              updateAppearancePosition();
              setIsAppearanceOpen((open) => !open);
            }}
            aria-label="Aparência"
            aria-expanded={isAppearanceOpen}
            title="Aparência"
            className={cn(
              TOPBAR_BUTTON,
              isAppearanceOpen && "bg-topbar-border text-topbar-foreground",
            )}
          >
            <Palette className="size-[18px]" strokeWidth={1.5} />
          </button>

          {canPortal &&
            createPortal(
              <section
                ref={appearancePanelRef}
                role="dialog"
                aria-label="Aparência"
                aria-modal={false}
                style={{ top: appearanceTop, right: appearanceRight }}
                className={cn(
                  "fixed z-[90] flex max-h-[calc(100dvh-80px)] w-[360px] max-w-[calc(100vw-16px)] origin-top-right flex-col gap-[18px] overflow-y-auto rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-xl transition duration-150 motion-reduce:transition-none",
                  isAppearanceOpen
                    ? "visible scale-100 opacity-100"
                    : "invisible pointer-events-none scale-95 opacity-0",
                )}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">Aparência</h2>
                  <button
                    type="button"
                    onClick={() => setIsAppearanceOpen(false)}
                    aria-label="Fechar aparência"
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3.5" strokeWidth={1.5} />
                  </button>
                </div>
                <AppearancePanel />
              </section>,
              document.body,
            )}
        </div>

        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={
            pendingCount > 0
              ? `Notificações, ${pendingCount} alertas pendentes`
              : "Notificações"
          }
          title="Notificações"
          className={cn(TOPBAR_BUTTON, "relative")}
        >
          <Bell className="size-[18px]" strokeWidth={1.5} />
          {pendingCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-[10px] top-[9px] size-1.5 rounded-full bg-signal"
            />
          )}
        </button>
        <HeaderAccountMenu />
      </div>
    </header>
  );
}
