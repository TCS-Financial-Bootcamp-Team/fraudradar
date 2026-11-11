"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Database,
  LayoutDashboard,
  type LucideIcon,
  Radar,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "cn";
import { CollapsedTooltip, TooltipProvider } from "@/components/ui/tooltip";
import { isNavItemActive } from "@/lib/sidebar";

export const SIDEBAR_ID = "app-sidebar";

interface SidebarProps {
  id?: string;
  isOpen: boolean;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  isExpanded: boolean;
  onClick?: () => void;
}

const SIDEBAR_TRANSITION =
  "duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none";

const navigationItems = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/alerts", label: "Fila de alertas", icon: Radar },
  { href: "/monitoring", label: "Monitoramento", icon: Activity },
  { href: "/ingestion", label: "Fontes de dados", icon: Database },
];

export function SidebarNavItem({
  href,
  label,
  icon: IconComponent,
  pathname,
  isExpanded,
  onClick,
}: SidebarNavItemProps) {
  const isActive = isNavItemActive(pathname, href);

  return (
    <CollapsedTooltip label={label} enabled={!isExpanded}>
      <Link
        href={href}
        onClick={onClick}
        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        aria-current={isActive ? "page" : undefined}
      >
        <div
          className={cn(
            "flex items-center rounded-md transition-all",
            SIDEBAR_TRANSITION,
            isExpanded
              ? "justify-start px-3 py-2.5"
              : "mx-auto h-10 w-10 justify-center",
            isActive
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <IconComponent
            size={20}
            strokeWidth={isActive ? 2.5 : 2}
            className={cn(
              "shrink-0",
              isActive ? "text-[var(--brand-accent)]" : ""
            )}
          />
          <span
            className={cn(
              "ml-3 overflow-hidden transition-all",
              SIDEBAR_TRANSITION,
              isExpanded
                ? "max-w-[150px] opacity-100"
                : "ml-0 max-w-0 opacity-0"
            )}
          >
            <span className="block w-[150px] text-left text-sm leading-tight whitespace-nowrap">
              {label}
            </span>
          </span>
        </div>
      </Link>
    </CollapsedTooltip>
  );
}

export function Sidebar({
  id = SIDEBAR_ID,
  isOpen,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const isExpanded = isOpen || Boolean(isMobileOpen);

  useEffect(() => {
    if (!isMobileOpen || !onMobileClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onMobileClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileOpen, onMobileClose]);

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        id={id}
        className={cn(
          "relative z-[70] flex h-full flex-col select-none border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width]",
          SIDEBAR_TRANSITION,
          "hidden md:flex",
          isOpen ? "md:w-64" : "md:w-20",
          isMobileOpen
            ? "fixed inset-y-0 left-0 flex w-64 translate-x-0"
            : "fixed inset-y-0 left-0 w-64 -translate-x-full md:relative md:translate-x-0"
        )}
      >
        <div
          className={cn(
            "relative flex h-16 shrink-0 items-center border-b border-sidebar-border/50 px-4 transition-all",
            SIDEBAR_TRANSITION,
            isExpanded ? "justify-start" : "justify-center"
          )}
        >
          {isMobileOpen && (
            <button
              type="button"
              onClick={onMobileClose}
              className="absolute right-4 rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar md:hidden"
              aria-label="Fechar menu"
            >
              <X size={20} />
            </button>
          )}

          <Link
            href="/dashboard"
            onClick={onMobileClose}
            className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <Radar className="size-7 text-[var(--brand-accent)]" />
            </div>
            <div
              className={cn(
                "ml-3 flex flex-col justify-center overflow-hidden whitespace-nowrap transition-all",
                SIDEBAR_TRANSITION,
                isExpanded ? "max-w-full opacity-100" : "ml-0 max-w-0 opacity-0"
              )}
            >
              <span className="text-lg font-semibold tracking-tight text-white">
                FraudRadar{" "}
                <span className="text-[10px] font-normal opacity-60">PLD</span>
              </span>
            </div>
          </Link>
        </div>

        <TooltipProvider delay={200}>
          <nav
            aria-label="Navegação principal"
            className="flex flex-1 flex-col space-y-4 overflow-x-hidden overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="space-y-1.5">
              <div
                className={cn(
                  "overflow-hidden px-3 transition-all",
                  SIDEBAR_TRANSITION,
                  isExpanded ? "max-h-8 pb-1 pt-2 opacity-100" : "max-h-0 p-0 opacity-0"
                )}
              >
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/60">
                  Espaço de análise
                </p>
              </div>

              {navigationItems.map(({ href, label, icon }) => (
                <SidebarNavItem
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  pathname={pathname}
                  isExpanded={isExpanded}
                  onClick={onMobileClose}
                />
              ))}
            </div>
          </nav>

          <div className="shrink-0 border-t border-sidebar-border/50 p-4">
            <SidebarNavItem
              href="/settings"
              label="Configurações"
              icon={Settings2}
              pathname={pathname}
              isExpanded={isExpanded}
              onClick={onMobileClose}
            />
          </div>
        </TooltipProvider>
      </aside>
    </>
  );
}
