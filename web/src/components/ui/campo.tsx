import type { ComponentProps, ReactNode } from "react";

export const estiloCampo =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Input(props: ComponentProps<"input">) {
  return (
    <input {...props} className={`${estiloCampo} ${props.className ?? ""}`} />
  );
}
export function Select(props: ComponentProps<"select">) {
  return (
    <select {...props} className={`${estiloCampo} ${props.className ?? ""}`} />
  );
}
export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`${estiloCampo} min-h-28 ${props.className ?? ""}`}
    />
  );
}
export function Campo({
  nome,
  erro,
  children,
}: {
  nome: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{nome}</span>
      {children}
      {erro && (
        <span role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      )}
    </label>
  );
}
