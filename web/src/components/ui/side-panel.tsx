"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md border-l border-border bg-card p-0 text-foreground backdrop:bg-foreground/30"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar painel"
            onClick={onClose}
          >
            <X />
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
