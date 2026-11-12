import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SIDEBAR_COOKIE,
  getAlertIdFromPathname,
  getBreadcrumb,
  isNavItemActive,
  isSidebarOpenFromCookie,
  persistSidebarState,
} from "../src/lib/sidebar";

test("sidebar: abre por padrão e só recolhe com o valor 'closed'", () => {
  assert.equal(SIDEBAR_COOKIE, "fraudradar-sidebar");
  assert.equal(isSidebarOpenFromCookie(undefined), true);
  assert.equal(isSidebarOpenFromCookie(null), true);
  assert.equal(isSidebarOpenFromCookie(""), true);
  assert.equal(isSidebarOpenFromCookie("open"), true);
  assert.equal(isSidebarOpenFromCookie("qualquer-coisa"), true);
  assert.equal(isSidebarOpenFromCookie("closed"), false);
});

test("sidebar: isNavItemActive reconhece rota exata, sub-rotas e rejeita falsos positivos", () => {
  assert.equal(isNavItemActive("/dashboard", "/dashboard"), true);
  assert.equal(isNavItemActive("/accounts", "/accounts"), true);
  assert.equal(isNavItemActive("/alerts", "/alerts"), true);
  assert.equal(isNavItemActive("/alerts/123", "/alerts"), true);
  assert.equal(isNavItemActive("/settings", "/settings"), true);
  assert.equal(isNavItemActive("/settings/profile", "/settings"), true);

  assert.equal(isNavItemActive("/alertsx", "/alerts"), false);
  assert.equal(isNavItemActive("/", "/dashboard"), false);
  assert.equal(isNavItemActive("/monitoring", "/alerts"), false);
  assert.equal(isNavItemActive("/dashboard", "/"), false);
  assert.equal(isNavItemActive("/", "/"), true);
});

test("sidebar: persistSidebarState lida de forma segura fora do navegador", () => {
  assert.doesNotThrow(() => {
    persistSidebarState(true);
    persistSidebarState(false);
  });
});

test("sidebar: getBreadcrumb mapeia rotas conhecidas e padrão", () => {
  assert.deepEqual(getBreadcrumb("/dashboard"), {
    group: "Análise",
    page: "Visão geral",
  });
  assert.deepEqual(getBreadcrumb("/"), {
    group: "Análise",
    page: "Contas suspeitas",
  });
  assert.deepEqual(getBreadcrumb(""), {
    group: "Análise",
    page: "Contas suspeitas",
  });
  assert.deepEqual(getBreadcrumb("/accounts"), {
    group: "Análise",
    page: "Contas suspeitas",
  });
  assert.deepEqual(getBreadcrumb("/alerts"), {
    group: "Análise",
    page: "Fila de alertas",
  });
  assert.deepEqual(getBreadcrumb("/alerts/3126"), {
    group: "Fila de alertas",
    page: "Alerta 3126",
  });
  assert.deepEqual(getBreadcrumb("/alerts/AL-9988"), {
    group: "Fila de alertas",
    page: "Alerta AL-9988",
  });
  assert.deepEqual(getBreadcrumb("/monitoring"), {
    group: "Qualidade",
    page: "Monitoramento",
  });
  assert.deepEqual(getBreadcrumb("/ingestion"), {
    group: "Dados",
    page: "Fontes de dados",
  });
  assert.deepEqual(getBreadcrumb("/settings"), {
    group: "Conta",
    page: "Configurações",
  });
});

test("sidebar: getAlertIdFromPathname detecta alertas em rotas de detalhe", () => {
  assert.equal(getAlertIdFromPathname("/alerts/3126"), "3126");
  assert.equal(getAlertIdFromPathname("/alerts/abc-123/sub"), "abc-123");
  assert.equal(getAlertIdFromPathname("/alerts"), undefined);
  assert.equal(getAlertIdFromPathname("/alerts/"), undefined);
  assert.equal(getAlertIdFromPathname("/dashboard"), undefined);
  assert.equal(getAlertIdFromPathname(""), undefined);
});

test("sidebar: tooltip recolhido usa portal acima da moldura e alinhado ao item", () => {
  const tooltip = readFileSync("src/components/ui/tooltip.tsx", "utf8");
  const accountMenu = readFileSync(
    "src/components/layout/account-menu.tsx",
    "utf8",
  );

  assert.match(tooltip, /<Tooltip\.Portal>/);
  assert.match(tooltip, /side="right"/);
  assert.match(tooltip, /align="center"/);
  assert.match(tooltip, /sideOffset=\{10\}/);
  assert.match(tooltip, /className="z-\[90\]"/);
  assert.match(tooltip, /bg-foreground/);
  assert.match(tooltip, /text-background/);
  assert.match(accountMenu, /<CollapsedTooltip label=\{`\$\{name\} .* conta`\}/);
});
