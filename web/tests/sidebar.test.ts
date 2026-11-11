import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SIDEBAR_COOKIE,
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
