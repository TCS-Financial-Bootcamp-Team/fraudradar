"use client";

import { Bell, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderAccountMenu } from "./account-menu";
import { SIDEBAR_ID } from "./sidebar";

interface HeaderProps {
  isSidebarOpen?: boolean;
  isMobileMenuOpen?: boolean;
  sidebarId?: string;
  onToggleSidebar?: () => void;
  onMobileMenuToggle?: () => void;
  onOpenNotifications: () => void;
}

export function Header({
  isSidebarOpen,
  isMobileMenuOpen,
  sidebarId = SIDEBAR_ID,
  onToggleSidebar,
  onMobileMenuToggle,
  onOpenNotifications,
}: HeaderProps) {
  return (
    <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 text-card-foreground transition-all duration-300 motion-reduce:transition-none">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex shrink-0 items-center">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:flex"
              aria-label="Alternar barra lateral"
              aria-expanded={isSidebarOpen}
            >
              <Menu size={20} />
            </button>
          )}
          {onMobileMenuToggle && (
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
              aria-label="Abrir menu"
              aria-expanded={Boolean(isMobileMenuOpen)}
              aria-controls={sidebarId}
            >
              <Menu size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <ThemeToggle className="size-10 text-muted-foreground hover:text-foreground" />
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label="Abrir notificações"
          className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Bell className="size-5" />
        </button>
        <HeaderAccountMenu />
      </div>
    </header>
  );
}
