"use client";

import * as React from "react";
import { Tooltip } from "@base-ui/react/tooltip";

export const TooltipProvider = Tooltip.Provider;

export function CollapsedTooltip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: React.ReactElement;
}) {
  if (!enabled) return children;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="right"
          align="center"
          sideOffset={10}
          className="z-[90]"
        >
          <Tooltip.Popup className="select-none rounded-[6px] bg-foreground px-2 py-1 text-xs font-medium text-background">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ActionTooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner
          side={side}
          align="center"
          sideOffset={6}
          className="z-[90]"
        >
          <Tooltip.Popup className="select-none rounded-[6px] bg-foreground px-2 py-1 text-xs font-medium text-background">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
