"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, LogOut, SlidersHorizontal } from "lucide-react";
import { cn } from "cn";
import { CollapsedTooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProfile } from "@/features/auth/hooks/use-profile";
import { useDismiss } from "./use-dismiss";

type AccountMenuPlacement = "header" | "sidebar-expanded" | "sidebar-collapsed";

interface AccountMenuProps {
  placement: AccountMenuPlacement;
  onNavigate?: () => void;
}

export function getInitials(name?: string): string {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AccountMenu({ placement, onNavigate }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const t = useTranslations("shell.account");
  const profile = useProfile();
  const auth = useAuth();

  useDismiss(isOpen, containerRef, (reason) => {
    setIsOpen(false);
    if (reason === "escape") triggerRef.current?.focus();
  });

  const name = profile.data?.name || t("myAccount");
  // O contrato atual do perfil não expõe cargo; este é o papel único do produto.
  const role = t("role");
  const isHeader = placement === "header";
  const isExpanded = placement === "sidebar-expanded";

  const closeMenu = () => {
    setIsOpen(false);
    onNavigate?.();
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setIsOpen((open) => !open)}
      aria-controls={menuId}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      aria-label={t("menuLabel")}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2",
        isHeader
          ? "grid size-10 place-items-center rounded-lg text-topbar-foreground transition-colors hover:bg-topbar-border focus-visible:ring-topbar-foreground"
          : "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:ring-sidebar-ring",
        !isHeader && !isExpanded && "justify-center",
        !isHeader && isOpen && "bg-sidebar-accent",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full font-semibold",
          isHeader
            ? "size-8 bg-topbar-foreground text-xs text-topbar"
            : "size-[30px] bg-sidebar-foreground text-[11px] text-sidebar",
        )}
      >
        {getInitials(profile.data?.name)}
      </span>
      {isExpanded && (
        <>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
            <span className="truncate text-[13px] font-medium">{name}</span>
            <span className="truncate text-xs text-sidebar-muted">{role}</span>
          </span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-sidebar-muted"
            strokeWidth={1.5}
          />
        </>
      )}
    </button>
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative", isHeader ? "shrink-0" : "w-full")}
    >
      {placement === "sidebar-collapsed" ? (
        <CollapsedTooltip label={t("tooltip", { name })} enabled={!isOpen}>
          {trigger}
        </CollapsedTooltip>
      ) : (
        trigger
      )}

      <div
        id={menuId}
        role="menu"
        aria-label={t("menu")}
        className={cn(
          "absolute z-[80] flex origin-bottom-left flex-col gap-0.5 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-xl transition duration-150 motion-reduce:transition-none",
          placement === "header" &&
            "right-0 top-[calc(100%+8px)] w-[240px] origin-top-right",
          placement === "sidebar-expanded" &&
            "bottom-[calc(100%-6px)] left-0 w-full",
          placement === "sidebar-collapsed" &&
            "bottom-0 left-[calc(100%+10px)] w-[220px]",
          isOpen
            ? "visible scale-100 opacity-100"
            : "invisible pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="mb-1 flex flex-col border-b border-soft px-2.5 py-2.5 leading-[1.35]">
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">{role}</span>
        </div>
        <Link
          href="/settings"
          role="menuitem"
          onClick={closeMenu}
          className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.5} />
          {t("settings")}
        </Link>
        <button
          type="button"
          role="menuitem"
          disabled={auth.busy}
          onClick={() => {
            setIsOpen(false);
            onNavigate?.();
            void auth.signOut();
          }}
          className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogOut className="size-4" strokeWidth={1.5} />
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}

export function HeaderAccountMenu() {
  return <AccountMenu placement="header" />;
}

export function SidebarAccountMenu({
  isExpanded,
  onNavigate,
}: {
  isExpanded: boolean;
  onNavigate?: () => void;
}) {
  return (
    <AccountMenu
      placement={isExpanded ? "sidebar-expanded" : "sidebar-collapsed"}
      onNavigate={onNavigate}
    />
  );
}
