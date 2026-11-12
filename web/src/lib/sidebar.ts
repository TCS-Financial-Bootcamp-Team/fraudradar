export const SIDEBAR_COOKIE = "fraudradar-sidebar";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export const SIDEBAR_NAV_GROUPS = [
  {
    label: "Análise",
    items: [
      { href: "/accounts", label: "Contas suspeitas" },
      { href: "/dashboard", label: "Visão geral" },
      { href: "/alerts", label: "Fila de alertas" },
    ],
  },
  {
    label: "Qualidade",
    items: [{ href: "/monitoring", label: "Monitoramento" }],
  },
  {
    label: "Dados",
    items: [{ href: "/ingestion", label: "Fontes de dados" }],
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
 * Resolve o caminho de navegação "<grupo> / <página>" a partir da rota atual.
 * Exemplos:
 * - "/dashboard" -> { group: "Análise", page: "Visão geral" }
 * - "/alerts" -> { group: "Análise", page: "Fila de alertas" }
 * - "/alerts/3126" -> { group: "Fila de alertas", page: "Alerta 3126" }
 * - "/monitoring" -> { group: "Qualidade", page: "Monitoramento" }
 * - "/ingestion" -> { group: "Dados", page: "Fontes de dados" }
 * - "/settings" -> { group: "Conta", page: "Configurações" }
 */
export function getBreadcrumb(pathname: string): BreadcrumbInfo {
  if (!pathname || pathname === "/" || pathname === "/accounts") {
    return { group: "Análise", page: "Contas suspeitas" };
  }
  if (pathname === "/dashboard") {
    return { group: "Análise", page: "Visão geral" };
  }
  if (pathname === "/alerts") {
    return { group: "Análise", page: "Fila de alertas" };
  }
  const alertMatch = pathname.match(/^\/alerts\/([^/]+)/);
  if (alertMatch) {
    return { group: "Fila de alertas", page: `Alerta ${alertMatch[1]}` };
  }
  if (pathname.startsWith("/settings")) {
    return { group: "Conta", page: "Configurações" };
  }

  for (const group of SIDEBAR_NAV_GROUPS) {
    const item = group.items.find(({ href }) => isNavItemActive(pathname, href));
    if (item) return { group: group.label, page: item.label };
  }

  return { group: "Análise", page: "Visão geral" };
}

/**
 * Extrai o ID do alerta caso a rota atual seja de detalhe (/alerts/[id]).
 */
export function getAlertIdFromPathname(pathname: string): string | undefined {
  if (!pathname) return undefined;
  const match = pathname.match(/^\/alerts\/([^/]+)/);
  return match ? match[1] : undefined;
}
