import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";

export const SIDEBAR_COOKIE = "fraudradar-sidebar";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

// Os rótulos ficam em messages/<idioma>/shell.json (`nav.groups.*` e `nav.items.*`).
export const SIDEBAR_NAV_GROUPS = [
  {
    group: "analysis",
    items: [
      { href: "/dashboard", item: "dashboard" },
      { href: "/alerts", item: "alerts" },
      { href: "/accounts", item: "accounts" },
    ],
  },
  {
    group: "quality",
    items: [{ href: "/monitoring", item: "monitoring" }],
  },
  {
    group: "data",
    items: [{ href: "/ingestion", item: "ingestion" }],
  },
] as const;

export type SidebarHref =
  (typeof SIDEBAR_NAV_GROUPS)[number]["items"][number]["href"];

/** Apenas `closed` recolhe: valor ausente ou qualquer outro mantém o padrão (aberto). */
export function isSidebarOpenFromCookie(
  value: string | null | undefined,
): boolean {
  return value !== "closed";
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (!href || href === "/") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function persistSidebarState(isOpen: boolean): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${SIDEBAR_COOKIE}=${isOpen ? "open" : "closed"}; Path=/; Max-Age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`;
  } catch {
    // Ignora falha em ambientes com restrição de cookies.
  }
}

export interface BreadcrumbInfo {
  group: string;
  page: string;
}

/**
 * Resolve o caminho de navegação "<grupo> / <página>" a partir da rota atual, no idioma pedido.
 * Exemplos (pt-BR):
 * - "/dashboard" -> { group: "Análise", page: "Visão geral" }
 * - "/alerts" -> { group: "Análise", page: "Fila de alertas" }
 * - "/alerts/3126" -> { group: "Fila de alertas", page: "Alerta 3126" }
 * - "/monitoring" -> { group: "Qualidade", page: "Monitoramento" }
 * - "/ingestion" -> { group: "Dados", page: "Fontes de dados" }
 * - "/settings" -> { group: "Conta", page: "Configurações" }
 */
export function getBreadcrumb(
  pathname: string,
  locale: AppLocale = DEFAULT_LOCALE,
): BreadcrumbInfo {
  const t = getT("shell.nav", locale);
  if (!pathname || pathname === "/" || pathname === "/dashboard") {
    return { group: t("groups.analysis"), page: t("items.dashboard") };
  }
  if (pathname === "/accounts") {
    return { group: t("groups.analysis"), page: t("items.accounts") };
  }
  if (pathname === "/alerts") {
    return { group: t("groups.analysis"), page: t("items.alerts") };
  }
  const alertMatch = pathname.match(/^\/alerts\/([^/]+)/);
  if (alertMatch) {
    return {
      group: t("items.alerts"),
      page: t("alertPage", { id: alertMatch[1] }),
    };
  }
  if (pathname.startsWith("/settings")) {
    return { group: t("groups.account"), page: t("items.settings") };
  }

  for (const group of SIDEBAR_NAV_GROUPS) {
    const item = group.items.find(({ href }) => isNavItemActive(pathname, href));
    if (item) {
      return { group: t(`groups.${group.group}`), page: t(`items.${item.item}`) };
    }
  }

  return { group: t("groups.analysis"), page: t("items.dashboard") };
}

/**
 * Extrai o ID do alerta caso a rota atual seja de detalhe (/alerts/[id]).
 */
export function getAlertIdFromPathname(pathname: string): string | undefined {
  if (!pathname) return undefined;
  const match = pathname.match(/^\/alerts\/([^/]+)/);
  return match ? match[1] : undefined;
}
