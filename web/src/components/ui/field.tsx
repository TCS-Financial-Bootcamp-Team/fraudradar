import type { ComponentProps, ReactNode } from "react";

export const fieldClassName =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Input(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`${fieldClassName} ${props.className ?? ""}`}
    />
  );
}
export function Select(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`${fieldClassName} ${props.className ?? ""}`}
    />
  );
}
export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`${fieldClassName} min-h-28 ${props.className ?? ""}`}
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
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
