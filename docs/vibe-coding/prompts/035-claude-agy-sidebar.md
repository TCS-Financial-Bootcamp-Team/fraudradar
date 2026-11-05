---
id: 035
area: frontend
autor: Claude Code (conta 1)
destino: agy (Antigravity CLI)
pai: 034
data: 2026-11-05
---

# Finish the FraudRadar web sidebar/header refactor

You are working in `C:\codigo\pessoal\fraudradar`, branch `fix/web-sidebar-layout`
(already checked out). Work autonomously until the task is done and the gates are green;
nobody will answer questions while you run.

## Context

FraudRadar PLD is a bootcamp project (anti-money-laundering monitoring, Next.js front end
in `web/`). Before anything, read `.agents/skills/fraudradar/SKILL.md` (repository rules)
and `web/AGENTS.md` (front-end rules; it points to the Next.js docs bundled in
`web/node_modules/next/dist/docs/` — read them before using any Next API you are unsure
about, this is Next 16).

The branch already holds an **uncommitted** refactor of the app shell. Read the current
diff (`git diff` and the untracked files) before editing:

- `web/src/components/app-shell.tsx` — shell, now a flex layout using the components below
- `web/src/components/layout/sidebar.tsx`, `layout/header.tsx`, `layout/account-menu.tsx`
- `web/src/components/ui/tooltip.tsx` — tooltip shown on collapsed sidebar items (Base UI)
- `web/src/lib/sidebar.ts` — cookie name, cookie parsing, persistence
- `web/src/app/(app)/layout.tsx` — reads the cookie on the server for the initial state
- `web/src/app/console.css` — the old `.app-sidebar`/`.app-topbar` CSS was removed
- `web/tests/sidebar.test.ts` — node:test unit tests for `lib/sidebar.ts`

`pnpm lint`, `pnpm test` and `pnpm build` are green today. Keep the refactor's design; your
job is to fix the defects below, not to redesign.

## Defects to fix

1. **Misaligned top edge.** The sidebar brand row is `h-[88px]` while the header is `h-16`,
   so their bottom borders do not line up. Make both the same height (use the header's
   `h-16`) and keep the logo vertically centered in both expanded and collapsed states.
2. **Dead prop.** `Sidebar` declares `onToggleSidebar` but never uses it, and `AppShell`
   passes it. Remove it from the interface and the call site (the header already has the
   toggle button).
3. **Duplicated nav item and inconsistent active rule.** The "Configurações" link copies the
   whole nav-item markup and decides "active" with `pathname === "/settings"`, while the
   main items use `pathname === href || pathname.startsWith(href + "/")`. Extract one
   `SidebarNavItem` component used by all six links, and one pure helper
   `isNavItemActive(pathname: string, href: string): boolean` in `web/src/lib/sidebar.ts`
   used by all of them. Add unit tests for it in `web/tests/sidebar.test.ts`, including the
   negative cases: `/alertsx` is not active for `/alerts`, `/settings/profile` is active
   for `/settings`, `/` is not active for `/dashboard`.
4. **Mobile drawer accessibility.** While the mobile drawer is open, the Escape key must
   close it. The desktop toggle button must expose `aria-expanded` with the sidebar state,
   and the mobile menu button must expose `aria-expanded` with the drawer state and
   `aria-controls` pointing to the sidebar `id`. Give the `<aside>` that `id`.
5. **Viewport height on mobile.** The shell root uses `h-screen`; switch to `h-dvh` so the
   layout does not overflow behind mobile browser bars.
6. **Unused storage write.** `persistSidebarState` also writes `localStorage`, which nothing
   reads; the cookie is the single source of truth. Remove the `localStorage` write (keep
   the try/catch around the cookie write).

## Rules

- Touch only files under `web/`. Do not edit anything else in the repository.
- Identifiers, file names and props in English; text a person reads (labels,
  `aria-label`, comments, test descriptions) in Brazilian Portuguese, matching what is
  already there.
- No new dependencies. No changes to routes, API services or schemas.
- Do **not** commit, stash, reset, or switch branches. Leave everything as uncommitted
  changes in the working tree.

## Gates (run from `web/`, all must be green)

```
rm -rf .next .next-test
pnpm lint
pnpm test
pnpm build
```

## Final report

Reply with: the list of files you changed and why (one line each), the exact output tail
of each gate, and anything you could not do or decided differently from this brief, with
the reason. If a defect turns out not to exist, say so instead of inventing a change.
