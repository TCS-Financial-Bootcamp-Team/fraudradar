"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "cn";
import { clampPage, getPageItems } from "@/lib/pagination";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const navButtonBase =
  "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border text-xs font-medium tabular-nums transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  const t = useTranslations("common.pagination");
  const safeTotal = Math.max(1, Math.trunc(totalPages));
  const safePage = clampPage(page, safeTotal);
  const items = getPageItems(safePage, safeTotal);

  const [draftState, setDraftState] = useState({
    page: safePage,
    value: String(safePage),
  });
  const draft =
    draftState.page === safePage ? draftState.value : String(safePage);

  function commitJump() {
    const trimmed = draft.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      setDraftState({ page: safePage, value: String(safePage) });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      setDraftState({ page: safePage, value: String(safePage) });
      return;
    }
    const target = clampPage(parsed, safeTotal);
    setDraftState({ page: target, value: String(target) });
    if (target !== safePage) {
      onPageChange(target);
    }
  }

  return (
    <nav
      aria-label={t("navLabel")}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("previous")}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className={cn(
            navButtonBase,
            "gap-1 border-border bg-card px-2.5 text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-45",
          )}
        >
          <ChevronLeft className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="hidden sm:inline">{t("previous")}</span>
        </button>

        {items.map((item, index) => {
          if (item === "ellipsis") {
            return (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="hidden h-9 min-w-7 items-center justify-center text-xs text-muted-foreground sm:inline-flex"
              >
                …
              </span>
            );
          }

          const isCurrent = item === safePage;
          return (
            <button
              key={item}
              type="button"
              aria-current={isCurrent ? "page" : undefined}
              aria-label={t("pageAria", { page: item })}
              onClick={() => {
                if (!isCurrent) onPageChange(item);
              }}
              className={cn(
                navButtonBase,
                "px-2",
                isCurrent
                  ? "inline-flex border-primary bg-primary text-primary-foreground"
                  : "hidden border-border bg-card text-foreground hover:bg-muted sm:inline-flex",
              )}
            >
              {item}
            </button>
          );
        })}

        <button
          type="button"
          aria-label={t("next")}
          disabled={safePage >= safeTotal}
          onClick={() => onPageChange(safePage + 1)}
          className={cn(
            navButtonBase,
            "gap-1 border-border bg-card px-2.5 text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-45",
          )}
        >
          <span className="hidden sm:inline">{t("next")}</span>
          <ChevronRight className="size-4 shrink-0" strokeWidth={1.5} />
        </button>
      </div>

      {safeTotal > 1 && (
        <label className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("goTo")}</span>
          <input
            type="number"
            min={1}
            max={safeTotal}
            inputMode="numeric"
            aria-label={t("goToAria", { total: safeTotal })}
            value={draft}
            onChange={(event) =>
              setDraftState({ page: safePage, value: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitJump();
              }
            }}
            onBlur={commitJump}
            className="h-9 w-14 rounded-lg border border-border bg-card px-2 text-center font-mono text-xs text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
      )}
    </nav>
  );
}
