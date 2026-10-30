import { apiPost, USE_MOCKS } from "@/lib/api";
import { pseudonymize } from "@/lib/format";
import {
  chatRequestSchema,
  chatResponseSchema,
  HISTORY_CONTENT_LIMIT,
  type ChatRequest,
} from "../schemas/assistant";
export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal,
  accounts = new Map<string, string>(),
) {
  // O mesmo mapa cobre histórico e pergunta; a redação precede o corte para não vazar IDs parciais.
  const history = request.history.slice(-20).map((m) => ({
    ...m,
    content: pseudonymize(m.content, accounts),
  }));
  const message = pseudonymize(request.message, accounts);
  const parsed = chatRequestSchema.parse({
    ...request,
    message,
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
