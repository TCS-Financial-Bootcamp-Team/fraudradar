"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { notify, subscribeToasts, type ToastItem } from "@/lib/notify";

const TOAST_LIFETIME_MS = 5000;

export interface ToasterProps {
  className?: string;
  richColors?: boolean;
  closeButton?: boolean;
}

interface ToastEntryProps {
  item: ToastItem;
}

function ToastEntry({ item }: ToastEntryProps) {
  const remainingRef = useRef(TOAST_LIFETIME_MS);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const isFocusedRef = useRef(false);

  const startTimer = useCallback(() => {
    if (timerRef.current !== null) return;
    if (isHoveredRef.current || isFocusedRef.current) return;
    if (remainingRef.current <= 0) {
      notify.dismiss(item.id);
      return;
    }

    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      notify.dismiss(item.id);
    }, remainingRef.current);
  }, [item.id]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (startRef.current !== null) {
        const elapsed = Date.now() - startRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        startRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [startTimer]);

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    pauseTimer();
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    if (!isFocusedRef.current) {
      startTimer();
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
    pauseTimer();
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    isFocusedRef.current = false;
    if (!isHoveredRef.current) {
      startTimer();
    }
  };

  return (
    <div
      role="status"
      tabIndex={0}
      className="toast group pointer-events-auto relative overflow-hidden box-border p-[14px_44px_16px_16px] rounded-xl bg-card text-foreground border border-border shadow-[0_10px_30px_rgba(0,0,0,0.10)] flex gap-3 items-start select-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
      title="Passe o mouse para pausar · botão direito fecha"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
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
        <span className="toast-progress-bar block h-full bg-primary" />
      </span>
    </div>
  );
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
      {items.map((item) => (
        <ToastEntry key={item.id} item={item} />
      ))}
    </section>
  );
}
