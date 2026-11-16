"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  Activity,
  CircleUserRound,
  Database,
  LayoutDashboard,
  ListFilter,
  type LucideIcon,
  X,
} from "lucide-react";
import { cn } from "cn";
import { CollapsedTooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  SIDEBAR_NAV_GROUPS,
  isNavItemActive,
  type SidebarHref,
} from "@/lib/sidebar";
import { SidebarAccountMenu } from "./account-menu";

export const SIDEBAR_ID = "app-sidebar";

interface SidebarProps {
  id?: string;
  isOpen: boolean;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  pendingCount?: number;
}

interface SidebarNavItemProps {
  href: SidebarHref;
  label: string;
  icon: LucideIcon;
  pathname: string;
  isExpanded: boolean;
  count?: number;
  onClick?: () => void;
}

const SIDEBAR_TRANSITION =
  "duration-200 ease-out motion-reduce:transition-none";

const NAV_ICONS: Record<SidebarHref, LucideIcon> = {
  "/accounts": CircleUserRound,
  "/dashboard": LayoutDashboard,
  "/alerts": ListFilter,
  "/monitoring": Activity,
  "/ingestion": Database,
};

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-[22px] shrink-0"
      fill="none"
    >
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10V1.75a8.25 8.25 0 0 1 7.6 5.05Z" fill="currentColor" />
      <circle cx="13.6" cy="12.4" r="1.6" className="fill-signal" />
    </svg>
  );
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  pathname,
  isExpanded,
  count,
  onClick,
}: SidebarNavItemProps) {
  const isActive = isNavItemActive(pathname, href);
  const hasCount = typeof count === "number" && count > 0;
  const t = useTranslations("shell.nav");
  const accessibleLabel = hasCount
    ? t("itemWithCount", { label, count })
    : label;

  return (
    <CollapsedTooltip label={accessibleLabel} enabled={!isExpanded}>
      <Link
        href={href}
        onClick={onClick}
        aria-label={accessibleLabel}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          SIDEBAR_TRANSITION,
          isExpanded ? "px-3" : "justify-center px-0",
          isActive
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.5} />
        {isExpanded && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
            {hasCount && (
              <span className="shrink-0 font-mono text-xs font-normal tabular-nums text-sidebar-muted">
                {count}
              </span>
            )}
          </>
        )}
      </Link>
    </CollapsedTooltip>
  );
}

export function Sidebar({
  id = SIDEBAR_ID,
  isOpen,
  isMobileOpen = false,
  onMobileClose,
  pendingCount = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const isExpanded = isOpen || isMobileOpen;

  useEffect(() => {
    if (!isMobileOpen || !onMobileClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, onMobileClose]);

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label={t("nav.closeSidebar")}
          onClick={onMobileClose}
          className="fixed inset-0 z-50 cursor-default bg-background/80 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        id={id}
        aria-label={t("nav.sidebarLabel")}
        className={cn(
          "fixed inset-y-0 left-0 z-[60] flex h-dvh w-[248px] shrink-0 select-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] md:sticky md:top-0 md:h-screen md:translate-x-0",
          SIDEBAR_TRANSITION,
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isOpen ? "md:w-[248px]" : "md:w-[68px]",
        )}
      >
        <div
          className={cn(
            "relative flex h-[72px] shrink-0 items-center overflow-hidden border-b border-sidebar-divider",
            isExpanded ? "px-[23px]" : "justify-center px-0",
          )}
        >
          <Link
            href="/accounts"
            onClick={onMobileClose}
            aria-label={t("brand.homeLabel")}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <BrandMark />
            {isExpanded && (
              <span className="text-base font-semibold tracking-[-0.015em]">
                FraudRadar
              </span>
            )}
          </Link>
          {isMobileOpen && (
            <button
              type="button"
              onClick={onMobileClose}
              aria-label={t("nav.closeMenu")}
              className="absolute right-3 grid size-10 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:hidden"
            >
              <X className="size-[18px]" strokeWidth={1.5} />
            </button>
          )}
        </div>

        <TooltipProvider delay={150}>
          <nav
            aria-label={t("nav.mainNav")}
            className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overflow-x-hidden px-3 py-[18px] [scrollbar-width:thin]"
          >
            {SIDEBAR_NAV_GROUPS.map((group) => (
              <div
                key={group.group}
                role="group"
                aria-label={t(`nav.groups.${group.group}`)}
                className="flex flex-col gap-0.5"
              >
                {isExpanded ? (
                  <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-sidebar-muted">
                    {t(`nav.groups.${group.group}`)}
                  </p>
                ) : (
                  <span
                    aria-hidden="true"
                    className="mx-3 mb-2 block h-px bg-sidebar-divider"
                  />
                )}
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    label={t(`nav.items.${item.item}`)}
                    icon={NAV_ICONS[item.href]}
                    pathname={pathname}
                    isExpanded={isExpanded}
                    count={item.href === "/alerts" ? pendingCount : undefined}
                    onClick={onMobileClose}
                  />
                ))}
              </div>
            ))}
          </nav>

          <div className="relative shrink-0 border-t border-sidebar-divider p-3">
            <SidebarAccountMenu
              isExpanded={isExpanded}
              onNavigate={onMobileClose}
            />
          </div>
        </TooltipProvider>
      </aside>
    </>
  );
}
