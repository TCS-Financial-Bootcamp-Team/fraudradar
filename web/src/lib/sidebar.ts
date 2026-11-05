export const SIDEBAR_COOKIE = "fraudradar-sidebar";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** Apenas `closed` recolhe: valor ausente ou qualquer outro mantém o padrão (aberto). */
export function isSidebarOpenFromCookie(value: string | null | undefined): boolean {
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
