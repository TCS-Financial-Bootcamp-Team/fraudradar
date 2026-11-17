import type { ChatRequest, Message } from "../schemas/assistant";

export const ALERT_CONTEXT_STORAGE_KEY =
  "fraudradar-assistant-alert-context";
export const ALERT_CONTEXT_CHANGE_EVENT =
  "fraudradar:assistant-alert-context-change";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Lê a preferência de envio do contexto do alerta na aba atual (padrão: ativo).
 */
export function readAlertContextEnabled(
  storage: StorageReader | null = getSessionStorage(),
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(ALERT_CONTEXT_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Persiste a preferência de contexto do alerta apenas no sessionStorage da aba.
 */
export function writeAlertContextEnabled(
  enabled: boolean,
  storage: StorageWriter | null = getSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ALERT_CONTEXT_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignora falhas de armazenamento em abas restritas.
  }
}

/**
 * Resolve o alert_id efetivo considerando se o compartilhamento de contexto está ativo.
 */
export function resolveEffectiveAlertId(
  alertId: string | undefined,
  shareAlertContext: boolean,
): string | undefined {
  return alertId && shareAlertContext ? alertId : undefined;
}

export interface BuildChatContextParams {
  page?: string | null;
  week?: string | null;
  alertId?: string;
  shareAlertContext?: boolean;
}

/**
 * Monta o objeto `context` da requisição de chat, omitindo `alert_id` quando desativado.
 */
export function buildChatContext({
  page,
  week,
  alertId,
  shareAlertContext = true,
}: BuildChatContextParams): ChatRequest["context"] {
  const effectiveAlertId = resolveEffectiveAlertId(alertId, shareAlertContext);
  return {
    page: page || "/dashboard",
    week: week ?? "",
    ...(effectiveAlertId ? { alert_id: effectiveAlertId } : {}),
  };
}

export interface BuildChatRequestParams extends BuildChatContextParams {
  message: string;
  history?: readonly Pick<Message, "role" | "content">[];
}

/**
 * Monta a carga enviada ao serviço do assistente com contexto e histórico recente.
 */
export function buildChatRequest({
  message,
  page,
  week,
  alertId,
  shareAlertContext = true,
  history = [],
}: BuildChatRequestParams): ChatRequest {
  return {
    message,
    context: buildChatContext({ page, week, alertId, shareAlertContext }),
    history: history.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };
}

export type SuggestionKey =
  | "decisionLaundering"
  | "decisionAgainst"
  | "decisionMissing"
  | "typology"
  | "legal";

/**
 * Retorna as chaves de sugestões conforme a presença do contexto de um alerta.
 */
export function getSuggestionKeys(alertId?: string): readonly SuggestionKey[] {
  return alertId
    ? (["decisionLaundering", "decisionAgainst", "decisionMissing", "legal"] as const)
    : (["typology", "legal"] as const);
}
