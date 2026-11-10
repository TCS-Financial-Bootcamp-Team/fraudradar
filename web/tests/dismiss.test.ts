import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isEscape, isOutside } from "../src/lib/dismiss";

const node = (children: unknown[] = []) => ({
  contains: (target: unknown) => children.includes(target),
});

test("dismiss: clique dentro do menu ou do gatilho não fecha; fora fecha", () => {
  const inMenu = {};
  const inTrigger = {};
  const outside = {};
  const menu = node([inMenu]);
  const trigger = node([inTrigger]);

  assert.equal(isOutside(inMenu, [menu, trigger]), false);
  assert.equal(isOutside(inTrigger, [menu, trigger]), false);
  assert.equal(isOutside(outside, [menu, trigger]), true);
  // Ref ainda não montado não conta como "dentro".
  assert.equal(isOutside(outside, [null, undefined, menu]), true);
});

test("dismiss: só Escape dispara o fechamento por teclado", () => {
  assert.equal(isEscape({ key: "Escape" }), true);
  assert.equal(isEscape({ key: "Enter" }), false);
});

test("dismiss: menus fecham com pointerdown (não mousedown) e devolvem o foco no Escape", () => {
  const hook = readFileSync("src/components/layout/use-dismiss.ts", "utf8");
  assert.match(hook, /"pointerdown"/);
  assert.doesNotMatch(hook, /"mousedown"/);

  for (const file of ["account-menu.tsx", "header.tsx"]) {
    const src = readFileSync(`src/components/layout/${file}`, "utf8");
    assert.match(src, /useDismiss\(/, `${file} deve usar useDismiss`);
    assert.doesNotMatch(src, /"mousedown"/, `${file} não deve ouvir mousedown`);
    assert.match(src, /reason === "escape"/);
  }
});

test("empilhamento: popover de Aparência fica acima do drawer e dos toasts", () => {
  const z = (source: string, marker: string): number => {
    const line = source.split("\n").find((l) => l.includes(marker)) ?? "";
    const match = line.match(/\bz-\[?(\d+)\]?/);
    assert.ok(match, `z-index não encontrado perto de ${marker}`);
    return Number(match[1]);
  };
  const header = readFileSync("src/components/layout/header.tsx", "utf8");
  const drawer = readFileSync(
    "src/features/assistant/components/assistant.tsx",
    "utf8",
  );
  const toast = readFileSync("src/components/ui/sonner.tsx", "utf8");

  const popover = z(header, '"fixed z-');
  assert.ok(popover > z(drawer, "assistant-drawer-in"));
  assert.ok(popover > z(toast, "fixed z-"));
  assert.match(header, /createPortal\(/);
});
