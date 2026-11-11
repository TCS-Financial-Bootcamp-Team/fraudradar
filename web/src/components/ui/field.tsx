import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const fieldClassName =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export function Input(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(fieldClassName, props.className)}
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(fieldClassName, props.className)}
    />
  );
}

export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(fieldClassName, "h-auto min-h-28 py-2.5", props.className)}
    />
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-[13px] font-medium text-foreground">
      <span>{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-xs text-signal font-normal">
          {error}
        </span>
      )}
    </label>
  );
}
