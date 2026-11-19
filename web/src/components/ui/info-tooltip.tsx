"use client";

import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { cn } from "cn";

export interface InfoTooltipProps {
  /** Rótulo acessível do botão disparador (ex.: "Saiba mais sobre Taxa de alerta"). */
  label: string;
  /** Conteúdo explicativo exibido dentro do tooltip. */
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Tooltip informativo acessível: disparador focável por teclado, `role="tooltip"`,
 * `aria-describedby` e alternância por toque/clique em telas estreitas.
 */
export function InfoTooltip({
  label,
  content,
  side = "top",
  className,
}: InfoTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();

  return (
    <Tooltip.Provider delay={150}>
      <Tooltip.Root
        open={open}
        onOpenChange={(nextOpen, details) => {
          if (details.reason === "trigger-press") return;
          setOpen(nextOpen);
        }}
      >
        <Tooltip.Trigger
          render={
            <button
              type="button"
              aria-label={label}
              aria-describedby={open ? tooltipId : undefined}
              onClick={() => setOpen((prev) => !prev)}
              className={cn(
                "relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card after:absolute after:-inset-2.5 after:content-['']",
                className,
              )}
            >
              <Info className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          }
        />
        <Tooltip.Portal>
          <Tooltip.Positioner
            side={side}
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className="z-[90]"
          >
            <Tooltip.Popup
              id={tooltipId}
              role="tooltip"
              className="max-w-[min(300px,calc(100vw-24px))] rounded-[8px] border border-border/30 bg-foreground px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-background"
            >
              {content}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
