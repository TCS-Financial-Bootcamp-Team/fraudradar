"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAppContext } from "@/components/app-context";
import { getErrorMessage, pseudonymize } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  ALERT_CONTEXT_CHANGE_EVENT,
  buildChatRequest,
  readAlertContextEnabled,
  writeAlertContextEnabled,
} from "../lib/context";
import { sendChatMessage } from "../services/assistant-service";
import type { Message } from "../schemas/assistant";

/**
 * Mantém a preferência de envio do contexto do alerta na aba atual via sessionStorage.
 */
export function useAlertContextPreference() {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const sync = () => setEnabledState(readAlertContextEnabled());
    sync();
    window.addEventListener(ALERT_CONTEXT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(ALERT_CONTEXT_CHANGE_EVENT, sync);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeAlertContextEnabled(next);
    try {
      window.dispatchEvent(new Event(ALERT_CONTEXT_CHANGE_EVENT));
    } catch {
      // Ignora ambientes sem CustomEvent/window completo.
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return { enabled, setEnabled, toggle };
}

export function useAssistant(alertId?: string, shareAlertContext = true) {
  const t = useTranslations("assistant");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const lockedRef = useRef(false);
  const accountsRef = useRef(new Map<string, string>());
  const page = usePathname();
  const { week } = useAppContext();

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function send(input: string) {
    const message = pseudonymize(input.trim(), accountsRef.current);
    if (!message || lockedRef.current) return false;
    lockedRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: message }]);

    try {
      const response = await sendChatMessage(
        buildChatRequest({
          message,
          page,
          week,
          alertId,
          shareAlertContext,
          history: messages,
        }),
        controller.signal,
        accountsRef.current,
      );

      if (!controller.signal.aborted) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: response.answer,
            sources: response.sources.length > 0 ? response.sources : undefined,
            kind: response.kind,
          },
        ]);
      }
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        notify.error(getErrorMessage(error));
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: t("failed"),
          },
        ]);
      }
      return false;
    } finally {
      lockedRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return { messages, busy, send };
}
