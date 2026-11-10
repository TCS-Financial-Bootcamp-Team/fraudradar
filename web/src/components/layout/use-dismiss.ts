"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isEscape, isOutside } from "@/lib/dismiss";

/**
 * Fecha um menu/popover aberto ao apertar o ponteiro fora de `containerRef`
 * (que deve conter o gatilho e o menu) e ao apertar Escape.
 * Usa pointerdown em captura: não depende de o alvo propagar o evento.
 */
export function useDismiss(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onDismiss: (reason: "outside" | "escape") => void,
) {
  const refs = useRef(containerRef);
  useEffect(() => {
    refs.current = containerRef;
  }, [containerRef]);

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const list = Array.isArray(refs.current) ? refs.current : [refs.current];
      if (isOutside(event.target, list.map((ref) => ref.current))) {
        onDismissRef.current("outside");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEscape(event)) onDismissRef.current("escape");
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);
}
