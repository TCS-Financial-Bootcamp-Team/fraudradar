"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { cn } from "cn";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProfile } from "@/features/auth/hooks/use-profile";

function getInitials(name?: string): string {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function HeaderAccountMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profile = useProfile();
  const auth = useAuth();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const name = profile.data?.name || "Minha conta";
  const email = profile.data?.email;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex size-10 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-expanded={isOpen}
        aria-label="Menu da conta"
      >
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-accent font-medium text-accent-foreground text-xs shadow-sm">
          {getInitials(profile.data?.name)}
        </div>
      </button>

      <div
        className={cn(
          "absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/10 transition-all duration-200 motion-reduce:transition-none",
          isOpen
            ? "opacity-100 scale-100 visible"
            : "opacity-0 scale-95 pointer-events-none invisible"
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          {email ? (
            <p className="truncate text-[11px] text-muted-foreground mt-0.5">
              {email}
            </p>
          ) : null}
        </div>

        <div className="py-1">
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:bg-muted"
          >
            Meu perfil
          </Link>
          <button
            type="button"
            disabled={auth.busy}
            onClick={() => {
              setIsOpen(false);
              void auth.signOut();
            }}
            className="group flex w-full items-center px-4 py-2 text-sm text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:bg-destructive/10"
          >
            <LogOut size={16} className="mr-2 text-muted-foreground group-hover:text-destructive" />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
