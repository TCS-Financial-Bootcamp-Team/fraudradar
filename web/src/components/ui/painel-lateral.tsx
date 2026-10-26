"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function PainelLateral({
  titulo,
  fechar,
  children,
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialogo = ref.current;
    dialogo?.showModal();
    return () => dialogo?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={titulo}
      onCancel={fechar}
      onClick={(e) => {
        if (e.target === ref.current) fechar();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md border-l border-border bg-card p-0 text-foreground backdrop:bg-foreground/30"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">{titulo}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar painel"
            onClick={fechar}
          >
            <X />
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
