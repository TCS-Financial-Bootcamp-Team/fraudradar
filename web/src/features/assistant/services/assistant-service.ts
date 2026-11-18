import { apiDelete, apiGet, apiPost, USE_MOCKS } from "@/lib/api";
import { pseudonymize } from "@/lib/format";
import {
  aiModelsResponseSchema,
  chatRequestSchema,
  chatResponseSchema,
  conversationDetailSchema,
  conversationListSchema,
  HISTORY_CONTENT_LIMIT,
  PAGE_STATE_MAX_FILTER_STR_LENGTH,
  type ChatRequest,
  type PageState,
} from "../schemas/assistant";

function sanitizePageState(
  pageState: PageState | null | undefined,
  accounts: Map<string, string>,
): PageState | null | undefined {
  if (!pageState) return pageState;
  const sanitizedFilters: PageState["filters"] = {};
  for (const [key, value] of Object.entries(pageState.filters)) {
    if (typeof value === "string") {
      sanitizedFilters[key] = pseudonymize(value, accounts).slice(
        0,
        PAGE_STATE_MAX_FILTER_STR_LENGTH,
      );
    } else {
      sanitizedFilters[key] = value;
    }
  }
  return {
    ...pageState,
    filters: sanitizedFilters,
  };
}

export async function fetchAiModels(signal?: AbortSignal) {
  return aiModelsResponseSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).aiModelsMock()
      : await apiGet("/ai/models", { signal }),
  );
}

export async function listConversations(limit = 30, signal?: AbortSignal) {
  const bounded = Math.min(100, Math.max(1, Math.trunc(limit)));
  return conversationListSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).listConversationsMock(bounded)
      : await apiGet(`/chat/conversations?limit=${bounded}`, { signal }),
  );
}

export async function fetchConversation(id: number, signal?: AbortSignal) {
  return conversationDetailSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).fetchConversationMock(id)
      : await apiGet(`/chat/conversations/${id}`, { signal }),
  );
}

export async function deleteConversation(id: number): Promise<void> {
  if (USE_MOCKS) {
    (await import("./mocks")).deleteConversationMock(id);
    return;
  }
  await apiDelete(`/chat/conversations/${id}`);
}

export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal,
  accounts = new Map<string, string>(),
) {
  // O mesmo mapa cobre histórico, filtros e pergunta; a redação precede o corte para não vazar IDs parciais.
  const history = request.history.slice(-20).map((m) => ({
    ...m,
    content: pseudonymize(m.content, accounts),
  }));
  const message = pseudonymize(request.message, accounts);
  const parsed = chatRequestSchema.parse({
    ...request,
    message,
    context: {
      ...request.context,
      page_state: sanitizePageState(request.context.page_state, accounts),
    },
    history: history.map((m) => ({
      ...m,
      content: pseudonymize(m.content, accounts).slice(
        0,
        HISTORY_CONTENT_LIMIT,
      ),
    })),
  });
  const path = parsed.context.alert_id
    ? "/alerts/" + encodeURIComponent(parsed.context.alert_id) + "/chat"
    : "/chat";
  return chatResponseSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).chatResponseMock(parsed)
      : await apiPost(path, parsed, signal),
  );
}
