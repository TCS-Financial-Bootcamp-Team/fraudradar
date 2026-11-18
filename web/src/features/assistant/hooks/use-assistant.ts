"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAppContext } from "@/components/app-context";
import { ApiError } from "@/lib/api";
import { getErrorMessage, pseudonymize } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  ALERT_CONTEXT_CHANGE_EVENT,
  buildChatRequest,
  readAlertContextEnabled,
  readStoredModel,
  resolveSelectedModel,
  writeAlertContextEnabled,
  writeStoredModel,
} from "../lib/context";
import { filterAllowedLinks } from "../lib/links";
import { usePublishedPageContext } from "../lib/page-context";
import {
  deleteConversation,
  fetchAiModels,
  fetchConversation,
  listConversations,
  sendChatMessage,
} from "../services/assistant-service";
import type {
  AiModelsResponse,
  ConversationSummary,
  Message,
} from "../schemas/assistant";

export type ProviderRetryErrorCode =
  | "ai.provider_unavailable"
  | "ai.provider_rate_limited";

export type AssistantMessage = Message & {
  errorCode?: ProviderRetryErrorCode;
};

function isProviderRetryErrorCode(
  code: string | undefined,
): code is ProviderRetryErrorCode {
  return (
    code === "ai.provider_unavailable" || code === "ai.provider_rate_limited"
  );
}

/**
 * Mantém a preferência de envio do contexto da página na aba atual via sessionStorage.
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

export function useAssistant(alertId?: string, shareContext = true) {
  const t = useTranslations("assistant");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modelsCatalog, setModelsCatalog] = useState<AiModelsResponse | null>(
    null,
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(() =>
    readStoredModel(),
  );
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  );
  const [openingConversation, setOpeningConversation] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<
    number | null
  >(null);

  const controllerRef = useRef<AbortController | null>(null);
  const lockedRef = useRef(false);
  const accountsRef = useRef(new Map<string, string>());
  const modelsFetchRef = useRef<AbortController | null>(null);
  const conversationsFetchRef = useRef<AbortController | null>(null);
  const openFetchRef = useRef<AbortController | null>(null);

  const page = usePathname();
  const { week } = useAppContext();
  const publishedPageContext = usePublishedPageContext();

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      modelsFetchRef.current?.abort();
      conversationsFetchRef.current?.abort();
      openFetchRef.current?.abort();
    };
  }, []);

  const loadModels = useCallback(async (force = false) => {
    if (!force && modelsFetchRef.current) return;
    modelsFetchRef.current?.abort();
    const controller = new AbortController();
    modelsFetchRef.current = controller;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const catalog = await fetchAiModels(controller.signal);
      if (controller.signal.aborted) return;
      setModelsCatalog(catalog);
      const resolved = resolveSelectedModel(readStoredModel(), catalog);
      setSelectedModel(resolved || null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setModelsError(getErrorMessage(error));
    } finally {
      if (modelsFetchRef.current === controller) {
        modelsFetchRef.current = null;
      }
      if (!controller.signal.aborted) {
        setModelsLoading(false);
      }
    }
  }, []);

  const selectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    writeStoredModel(modelId);
  }, []);

  const startNewChat = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    lockedRef.current = false;
    setBusy(false);
    setMessages([]);
    setConversationId(null);
    setNotice(null);
    accountsRef.current.clear();
  }, []);

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const loadConversations = useCallback(async () => {
    conversationsFetchRef.current?.abort();
    const controller = new AbortController();
    conversationsFetchRef.current = controller;
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      const items = await listConversations(30, controller.signal);
      if (!controller.signal.aborted) {
        setConversations(items);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setConversationsError(getErrorMessage(error));
      }
    } finally {
      if (conversationsFetchRef.current === controller) {
        conversationsFetchRef.current = null;
      }
      if (!controller.signal.aborted) {
        setConversationsLoading(false);
      }
    }
  }, []);

  const openConversation = useCallback(
    async (id: number): Promise<boolean> => {
      openFetchRef.current?.abort();
      const controller = new AbortController();
      openFetchRef.current = controller;
      setOpeningConversation(true);
      try {
        const detail = await fetchConversation(id, controller.signal);
        if (controller.signal.aborted) return false;
        controllerRef.current?.abort();
        controllerRef.current = null;
        lockedRef.current = false;
        setBusy(false);
        accountsRef.current.clear();
        setConversationId(detail.id);
        setNotice(null);
        setMessages(
          detail.messages.map((m) => ({
            role: m.role,
            content: m.content,
            kind: m.kind ?? undefined,
            sources: m.sources.length > 0 ? m.sources : undefined,
            links: filterAllowedLinks(m.links),
            model: m.model ?? null,
          })),
        );
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        const code = error instanceof ApiError ? error.code : undefined;
        if (code === "chat.conversation_not_found") {
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (conversationId === id) {
            startNewChat();
          }
          setNotice(t("history.conversationNotFound"));
        }
        notify.error(getErrorMessage(error));
        return false;
      } finally {
        if (openFetchRef.current === controller) {
          openFetchRef.current = null;
        }
        if (!controller.signal.aborted) {
          setOpeningConversation(false);
        }
      }
    },
    [conversationId, startNewChat, t],
  );

  const removeConversation = useCallback(
    async (id: number): Promise<boolean> => {
      setDeletingConversationId(id);
      try {
        await deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          startNewChat();
        }
        return true;
      } catch (error) {
        const code = error instanceof ApiError ? error.code : undefined;
        if (code === "chat.conversation_not_found") {
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (conversationId === id) {
            startNewChat();
          }
          return true;
        }
        notify.error(getErrorMessage(error));
        return false;
      } finally {
        setDeletingConversationId((curr) => (curr === id ? null : curr));
      }
    },
    [conversationId, startNewChat],
  );

  async function send(input: string) {
    const message = pseudonymize(input.trim(), accountsRef.current);
    if (!message || lockedRef.current) return false;
    lockedRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setNotice(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: message }]);

    try {
      const response = await sendChatMessage(
        buildChatRequest({
          message,
          page,
          path: page,
          week,
          alertId,
          shareAlertContext: shareContext,
          pageState: publishedPageContext?.pageState,
          history: messages,
          model: selectedModel,
          conversationId,
        }),
        controller.signal,
        accountsRef.current,
      );

      if (!controller.signal.aborted) {
        if (typeof response.conversation_id === "number") {
          setConversationId(response.conversation_id);
        }
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: response.answer,
            sources: response.sources.length > 0 ? response.sources : undefined,
            kind: response.kind,
            links: filterAllowedLinks(response.links),
            model: response.model ?? null,
          },
        ]);
      }
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = error instanceof ApiError ? error.code : undefined;
        if (code === "chat.conversation_not_found") {
          setConversationId(null);
          setMessages([]);
          accountsRef.current.clear();
          setNotice(t("history.conversationNotFound"));
          notify.error(getErrorMessage(error));
        } else if (isProviderRetryErrorCode(code)) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: getErrorMessage(error),
              errorCode: code,
            },
          ]);
        } else {
          notify.error(getErrorMessage(error));
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: t("failed"),
            },
          ]);
        }
      }
      return false;
    } finally {
      lockedRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return {
    messages,
    busy,
    send,
    conversationId,
    notice,
    clearNotice,
    startNewChat,
    modelsCatalog,
    selectedModel,
    modelsLoading,
    modelsError,
    loadModels,
    selectModel,
    conversations,
    conversationsLoading,
    conversationsError,
    openingConversation,
    deletingConversationId,
    loadConversations,
    openConversation,
    removeConversation,
    visibleCount: publishedPageContext?.visibleCount,
  };
}
