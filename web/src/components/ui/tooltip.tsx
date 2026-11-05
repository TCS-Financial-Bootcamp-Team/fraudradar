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
        <Tooltip.Positioner side="right" sideOffset={8}>
          <Tooltip.Popup className="z-50 rounded-md border border-border bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-xl">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
