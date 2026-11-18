import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { formatShortDate } from "@/lib/format";
import type {
  AiModelsResponse,
  ChatRequest,
  Message,
  PageState,
} from "../schemas/assistant";

export const ALERT_CONTEXT_STORAGE_KEY =
  "fraudradar-assistant-alert-context";
export const ALERT_CONTEXT_CHANGE_EVENT =
  "fraudradar:assistant-alert-context-change";
export const AI_MODEL_STORAGE_KEY = "fraudradar.ai.model";

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

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Lê a preferência de envio do contexto da página na aba atual (padrão: ativo).
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
 * Persiste a preferência de contexto da página apenas no sessionStorage da aba.
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
 * Lê o modelo escolhido pelo analista no localStorage, protegido contra falhas de acesso.
 */
export function readStoredModel(
  storage: StorageReader | null = getLocalStorage(),
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(AI_MODEL_STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Persiste o modelo selecionado no localStorage, protegido contra falhas de acesso.
 */
export function writeStoredModel(
  modelId: string,
  storage: StorageWriter | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(AI_MODEL_STORAGE_KEY, modelId);
  } catch {
    // Ignora falhas de armazenamento em ambientes restritos.
  }
}

/**
 * Resolve o modelo ativo: mantém o armazenado se ainda estiver disponível na API,
 * caso contrário retorna o padrão do servidor.
 */
export function resolveSelectedModel(
  storedId: string | null | undefined,
  catalog: Pick<AiModelsResponse, "default" | "models">,
): string {
  if (storedId && catalog.models.some((item) => item.id === storedId)) {
    return storedId;
  }
  return catalog.default || catalog.models[0]?.id || "";
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

/**
 * Converte ID textual de alerta em inteiro positivo quando numérico (descarta IDs sintéticos não numéricos).
 */
export function parsePositiveIntId(id: string | number): number | null {
  if (typeof id === "number") {
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export interface BuildChatContextParams {
  page?: string | null;
  path?: string | null;
  week?: string | null;
  alertId?: string;
  shareAlertContext?: boolean;
  pageState?: PageState | null;
}

/**
 * Monta o objeto `context` da requisição de chat.
 * `path` vai sempre; `alert_id` e `page_state` só são enviados quando o compartilhamento está ativo.
 */
export function buildChatContext({
  page,
  path,
  week,
  alertId,
  shareAlertContext = true,
  pageState,
}: BuildChatContextParams): ChatRequest["context"] {
  const resolvedPage = page || "/dashboard";
  const rawPath = path ?? resolvedPage;
  const normalizedPath = (
    rawPath.startsWith("/") ? rawPath : `/${rawPath}`
  ).slice(0, 200);
  const effectiveAlertId = resolveEffectiveAlertId(alertId, shareAlertContext);
  const effectivePageState =
    shareAlertContext && pageState ? pageState : undefined;

  return {
    page: resolvedPage,
    week: week ?? "",
    path: normalizedPath,
    ...(effectiveAlertId ? { alert_id: effectiveAlertId } : {}),
    ...(effectivePageState ? { page_state: effectivePageState } : {}),
  };
}

export interface BuildChatRequestParams extends BuildChatContextParams {
  message: string;
  history?: readonly Pick<Message, "role" | "content">[];
  model?: string | null;
  conversationId?: number | null;
}

/**
 * Monta a carga enviada ao serviço do assistente com contexto, modelo, conversa e histórico recente.
 * Mesmo quando `conversation_id` está definido, mantém `history` para compatibilidade com os mocks.
 */
export function buildChatRequest({
  message,
  page,
  path,
  week,
  alertId,
  shareAlertContext = true,
  pageState,
  history = [],
  model,
  conversationId,
}: BuildChatRequestParams): ChatRequest {
  return {
    message,
    context: buildChatContext({
      page,
      path,
      week,
      alertId,
      shareAlertContext,
      pageState,
    }),
    history: history.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    ...(model ? { model } : {}),
    ...(typeof conversationId === "number" && conversationId > 0
      ? { conversation_id: conversationId }
      : {}),
  };
}

export type SuggestionKey =
  | "decisionLaundering"
  | "decisionAgainst"
  | "decisionMissing"
  | "queueHighestScore"
  | "queueSummarizePage"
  | "whereImport"
  | "typology"
  | "legal";

/**
 * Retorna as chaves de sugestões conforme a rota atual.
 */
export function getSuggestionKeys(
  alertId?: string,
  pathname?: string | null,
): readonly SuggestionKey[] {
  if (alertId) {
    return [
      "decisionLaundering",
      "decisionAgainst",
      "decisionMissing",
      "legal",
    ] as const;
  }
  if (pathname === "/alerts") {
    return [
      "queueHighestScore",
      "queueSummarizePage",
      "whereImport",
      "typology",
      "legal",
    ] as const;
  }
  return ["typology", "legal", "whereImport"] as const;
}

/**
 * Resolve o rótulo do chip de contexto da barra do compositor conforme a rota e a contagem visível.
 */
export function getContextChipLabel({
  pathname,
  alertId,
  visibleCount,
  locale = DEFAULT_LOCALE,
}: {
  pathname?: string | null;
  alertId?: string;
  visibleCount?: number;
  locale?: AppLocale;
}): string {
  const t = getT("assistant.contextChip", locale);
  if (alertId) {
    return t("alert", { id: alertId });
  }
  if (pathname === "/alerts") {
    if (typeof visibleCount === "number" && visibleCount > 0) {
      return t("alertsCount", { count: visibleCount });
    }
    return t("alerts");
  }
  if (pathname === "/dashboard" || pathname === "/") {
    return t("dashboard");
  }
  if (pathname === "/monitoring") {
    return t("monitoring");
  }
  if (pathname === "/accounts") {
    return t("accounts");
  }
  if (pathname === "/ingestion") {
    return t("ingestion");
  }
  if (pathname?.startsWith("/settings")) {
    return t("settings");
  }
  return t("general");
}

/**
 * Formata data relativa curta para a lista de histórico de conversas.
 */
export function formatRelativeDate(
  isoDate: string,
  locale: AppLocale = DEFAULT_LOCALE,
  nowMs = Date.now(),
): string {
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return isoDate;
  const diffSeconds = Math.round((ts - nowMs) / 1000);
  if (Math.abs(diffSeconds) < 60) {
    return getT("assistant.history", locale)("now");
  }
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 3600) {
    return rtf.format(Math.round(diffSeconds / 60), "minute");
  }
  if (absSeconds < 86400) {
    return rtf.format(Math.round(diffSeconds / 3600), "hour");
  }
  if (absSeconds < 86400 * 7) {
    return rtf.format(Math.round(diffSeconds / 86400), "day");
  }
  return formatShortDate(isoDate, locale);
}
