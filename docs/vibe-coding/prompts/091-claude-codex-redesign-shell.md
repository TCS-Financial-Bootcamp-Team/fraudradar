---
id: 091
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Codex CLI (conta 2 do Pedro)
pai: 087
data: 2026-11-10
---

# Delegação ao Codex: moldura do redesenho, continuando o agy

Os cinco agy da fase 2 (086 a 090) pararam no meio: a cota do agy acabou em todos os modelos (volta em ~84 h). Pergunta ao Pedro: quem continua? Resposta: **Codex**. Só a conta 2 do Codex estava logada, com 91% da cota semanal usada; o Claude começou pela moldura (prompt 087), que é a parte mais visível, e pediu ao Pedro para logar outras contas para as demais frentes.

Prompt enviado ao Codex (o do 087 com um aviso no topo para continuar o trabalho parcial):

````text
IMPORTANT CONTEXT: a previous agent started this exact task in this worktree and stopped midway (it ran out of quota). Before doing anything, run `git status` and `git diff` in the worktree, judge what it already did, keep what is correct, fix what is not, and finish the task. You are Codex running non-interactively: when done, print the final report.

You are one of FOUR agents working IN PARALLEL on PHASE 2 of the FraudRadar PLD front-end redesign. You work in your own git worktree at C:/codigo/pessoal/fr-wt-shell on branch feat/web-redesign-shell; the other agents work in other worktrees on other files. Stay strictly inside the files listed under "You own"; you may READ anything. If you believe a file you do not own must change, do not change it: write it in your final report under "Needs from other agents".

Phase 1 (already in your branch) built the foundation: the theme engine (web/src/lib/theme/, web/src/components/theme/), the restyled primitives (web/src/components/ui/*), the shared CSS classes (web/src/app/console.css, globals.css) and notifications (web/src/lib/notify.ts). Use them; do NOT edit web/src/components/ui/*, web/src/lib/theme/*, web/src/components/theme/*, web/src/lib/notify.ts, globals.css or console.css (except where your section explicitly allows it).

Read first, and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/API_CONTRACTS.md, api/AGENTS.md (if you touch the API) and web/DESIGN.md (the approved design spec). The approved prototype is in the MAIN checkout at C:\codigo\pessoal\fraudradar\trash\prototype\Main.dc.html (the whole app: every screen is a `<sc-if value="{{is.<screen>}}">` block), Login.dc.html and Cadastro.dc.html. They are plain HTML + inline styles; translate them to this codebase's stack (Next.js App Router, Tailwind v4 with the theme tokens, lucide-react icons with strokeWidth 1.5, component → hook → service → API). Never hard-code colors: use the tokens (bg-background, bg-card, text-muted-foreground, border-border, bg-primary, text-signal, bg-track, bg-chart-muted, border-soft, bg-sidebar, text-sidebar-muted, bg-topbar, ...). Keep every existing behavior and data flow working: this is a visual redesign, not a rewrite of the logic. Do not invent data: charts and numbers come from the API (or the mocks when NEXT_PUBLIC_USE_MOCKS=true).

Rules: code identifiers in English; on-screen text, comments and docs in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env or web/.env.local. Do not run `docker compose down -v` or anything that deletes data.

Setup in your worktree (once): `cd C:/codigo/pessoal/fr-wt-shell\web && pnpm install` (copy C:\codigo\pessoal\fraudradar\web\.env.local into C:/codigo/pessoal/fr-wt-shell\web\ if it is missing; it is git-ignored).

## Verification (report exact summaries)
- cd C:/codigo/pessoal/fr-wt-shell\web && pnpm lint && pnpm test && pnpm build (if build fails with TS2307 on .next/dev/types, delete .next and .next-test and retry).
- Visual check with Playwright on `pnpm dev -p 3011` run from C:/codigo/pessoal/fr-wt-shell\web with NEXT_PUBLIC_USE_MOCKS=true set only in that process (do not edit .env.local), at 1440px and 390px wide, in the Grafite and Escuro themes. Use your own port 3011; other agents use other ports. If the login blocks you in mocks, say so.

## Final report (Portuguese)
Files changed and why, test results, what was not verified, "Needs from other agents", and any decision the product owner should know. Only claim what is actually in the diff.

## Your part: the app frame (sidebar, top bar, assistant drawer)

You own: web/src/components/app-shell.tsx, web/src/components/layout/* (sidebar.tsx, header.tsx, account-menu.tsx), web/src/lib/sidebar.ts, web/src/app/(app)/layout.tsx, web/src/app/(app)/loading.tsx, web/src/app/(app)/error.tsx, web/src/features/assistant/** (components, hooks, services, schemas), web/src/features/health/components/health-badge.tsx, and tests web/tests/sidebar.test.ts (plus new test files for your code).

Build, matching the prototype's aside/header/assistant/toast blocks and web/DESIGN.md "Moldura":
1. Sidebar: sticky, exactly 100vh (the profile must always be visible without scrolling the page; the nav scrolls inside if needed), 248px open / 68px collapsed with the existing persisted state (lib/sidebar.ts). Logo band 72px with a bottom divider. Nav in groups with captions: "Análise" (Visão geral /dashboard, Fila de alertas /alerts with the pending count already fetched in app-shell), "Qualidade" (Monitoramento /monitoring), "Dados" (Fontes de dados /ingestion). Collapsed: captions become thin dividers and every item shows a dark tooltip with its name on hover AND keyboard focus. Active item: sidebar-accent background, weight 500. Bottom: profile button (avatar initials, name, role from the existing profile hook) that opens a menu with "Configurações" (/settings) and "Sair" (the existing sign-out). The menu opens upwards when the sidebar is open and to the right when collapsed; closes on outside click and Escape. The standalone "Configurações" link at the bottom goes away (it lives in the profile menu). Keep the mobile behavior (off-canvas menu) working.
2. Top bar: 60px, sticky, topbar tokens. Left: collapse button + breadcrumb "<group> / <page>" from the route (e.g. "Análise / Fila de alertas", "Fila de alertas / Alerta 3126" on /alerts/[id], "Conta / Configurações"). Right: "Assistente" button (icon + text) that toggles the drawer, "Aparência" icon button opening a popover with the Phase 1 AppearancePanel, notifications bell (keep the existing notifications side panel and its content, restyled), account button (keep account-menu, restyled, same actions as the sidebar profile menu).
3. Assistant: replace the floating "Assistente IA" button with a right drawer (400px, full height, below nothing: over the content) opened from the top bar. Context chip: "Alerta <id>" when the route is /alerts/[id] (read it from the pathname; the chat must send that alert as context exactly like the current Chat does with alertId), otherwise "Semana de dd/mm/aaaa" from the app context. Empty state with title, short text and the existing suggestion buttons; messages (user right on primary, assistant left as plain text) with sources listed under each answer; "Consultando as fontes…" while waiting; textarea where Enter sends and Shift+Enter breaks the line; footer "A IA auxilia a análise; a decisão é humana." Keep the current service/hook calls and error handling (the API answers 503 today; the user must see the API's message through notify.error). Export nothing that the alert detail must render: the alert-detail agent will REMOVE the inline Chat from the alert page, so `Chat` may stop being exported once nothing else imports it (check with grep in your worktree; if alert-detail.tsx still imports it in your branch, keep the export so the build passes and say so in the report).
4. Notifications toasts: when the assistant drawer is open, the toast stack must not hide under it (move it to the left of the drawer). Coordinate only through CSS/state you own; if this needs a change in lib/notify.ts, put it under "Needs from other agents".
````
