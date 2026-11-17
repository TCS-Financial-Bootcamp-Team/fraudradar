"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "cn";
import { parseLegalSource } from "@/lib/legal-sources";

export interface LegalSourceItemProps {
  source: { title: string; excerpt: string };
  className?: string;
}

/**
 * Item expansível para fonte jurídica: oculta o trecho até expandir e exibe
 * link seguro (somente HTTPS) quando houver URL oficial.
 */
export function LegalSourceItem({ source, className }: LegalSourceItemProps) {
  const t = useTranslations("common.legalSources");
  const [expanded, setExpanded] = useState(false);
  const parsed = parseLegalSource(source);
  const hasExcerpt = parsed.excerpt.length > 0;

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border bg-soft/60 px-3 py-1.5 text-xs",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {hasExcerpt ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {parsed.title}
            </span>
          </button>
        ) : (
          <span className="flex min-h-9 min-w-0 flex-1 items-center font-medium text-foreground break-words [overflow-wrap:anywhere]">
            {parsed.title}
          </span>
        )}

        {parsed.officialUrl && (
          <a
            href={parsed.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded px-1.5 text-xs font-medium text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{t("openOfficial")}</span>
            <ExternalLink className="size-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          </a>
        )}
      </div>

      {expanded && hasExcerpt && (
        <p className="m-0 mt-1 border-t border-border/60 pt-2 pb-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {parsed.excerpt}
        </p>
      )}
    </div>
  );
}
