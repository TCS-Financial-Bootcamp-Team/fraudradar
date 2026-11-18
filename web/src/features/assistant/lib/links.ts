import {
  MAX_CHAT_LINKS,
  MAX_CHAT_LINK_LABEL_LENGTH,
  type ChatLink,
} from "../schemas/assistant";

const STATIC_ALLOWED_PATHS = new Set([
  "/dashboard",
  "/alerts",
  "/accounts",
  "/monitoring",
  "/ingestion",
  "/settings",
]);

// Permite apenas /alerts/{inteiro positivo}, sem zeros à esquerda, query, fragmento ou barra extra.
const ALERT_DETAIL_HREF_RE = /^\/alerts\/[1-9]\d*$/;

/**
 * Valida se um href devolvido pelo assistente pertence à lista estrita de rotas internas permitidas.
 */
export function isAllowedAssistantHref(href: string): boolean {
  if (typeof href !== "string") return false;
  if (STATIC_ALLOWED_PATHS.has(href)) return true;
  return ALERT_DETAIL_HREF_RE.test(href);
}

/**
 * Filtra os links de resposta mantendo apenas hrefs permitidos e rótulos válidos (máx. 5).
 */
export function filterAllowedLinks(
  links: readonly ChatLink[] | null | undefined,
): ChatLink[] {
  if (!links || links.length === 0) return [];
  const valid: ChatLink[] = [];
  for (const link of links) {
    if (!link || typeof link.href !== "string" || typeof link.label !== "string") {
      continue;
    }
    const label = link.label.trim();
    if (!label || label.length > MAX_CHAT_LINK_LABEL_LENGTH) continue;
    if (!isAllowedAssistantHref(link.href)) continue;
    valid.push({ href: link.href, label });
    if (valid.length >= MAX_CHAT_LINKS) break;
  }
  return valid;
}
