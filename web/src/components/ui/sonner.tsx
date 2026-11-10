"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { notify, subscribeToasts, type ToastItem } from "@/lib/notify";

export interface ToasterProps {
  className?: string;
  richColors?: boolean;
  closeButton?: boolean;
}

export function Toaster({ className }: ToasterProps) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Notificações"
      aria-live="polite"
      className={`fixed z-50 right-5 bottom-5 w-[360px] max-w-[calc(100vw-40px)] flex flex-col gap-2.5 pointer-events-none ${className ?? ""}`}
    >
      {items.map((item) => {
        return (
          <div
            key={item.id}
            role="status"
            className="toast group pointer-events-auto relative overflow-hidden box-border p-[14px_44px_16px_16px] rounded-xl bg-card text-foreground border border-border shadow-[0_10px_30px_rgba(0,0,0,0.10)] flex gap-3 items-start select-none"
            title="Passe o mouse para pausar · botão direito fecha"
            onContextMenu={(e) => {
              e.preventDefault();
              notify.dismiss(item.id);
            }}
          >
            {item.kind === "success" && (
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
              />
            )}
            {item.kind === "info" && (
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-track shadow-[inset_0_0_0_1px_var(--muted-foreground)]"
              />
            )}
            {item.kind === "error" && (
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-signal"
              />
            )}

            <div className="min-w-0 flex flex-col gap-0.5">
              <p className="m-0 text-sm font-medium leading-snug">{item.title}</p>
              {item.body && (
                <p className="m-0 text-[13px] text-muted-foreground leading-snug">
                  {item.body}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => notify.dismiss(item.id)}
              aria-label="Fechar notificação"
              className="absolute top-2 right-2 size-7 rounded-md border-0 bg-transparent text-muted-foreground hover:text-foreground grid place-items-center cursor-pointer transition-colors"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>

            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[2px] bg-soft"
            >
              <span
                className="toast-progress-bar block h-full bg-primary"
                onAnimationEnd={(e) => {
                  if (e.animationName === "toast-progress" && e.elapsedTime >= 4.5) {
                    notify.dismiss(item.id);
                  }
                }}
              />
            </span>
          </div>
        );
      })}
    </section>
  );
}
