"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-context";
import { getErrorMessage, pseudonymize } from "@/lib/format";
import { sendChatMessage } from "../services/assistant-service";
import type { Message } from "../schemas/assistant";

export function useAssistant(alertId?: string) {
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
        {
          message,
          context: { page, week, alert_id: alertId },
          history: messages.slice(-20),
        },
        controller.signal,
        accountsRef.current,
      );
      if (!controller.signal.aborted)
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              response.answer +
              (response.sources.length
                ? "\n\nFontes: " +
                  response.sources.map((s) => s.title).join("; ")
                : ""),
          },
        ]);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(getErrorMessage(error));
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Não foi possível responder. Tente enviar sua pergunta novamente.",
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
