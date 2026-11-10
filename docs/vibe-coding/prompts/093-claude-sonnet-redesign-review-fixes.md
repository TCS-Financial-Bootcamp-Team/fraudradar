---
id: 093
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code (conta 2 do Pedro, Sonnet)
pai: 092
data: 2026-11-10
---

# Delegação ao Sonnet: ajustes da revisão do redesenho

Depois de juntar as cinco frentes (lint, 40 testes do front, build e 391 testes Python verdes), o Claude conferiu a moldura no navegador e achou: menu do perfil que não fecha com clique fora, painel de Aparência por baixo da gaveta do assistente, e o âmbar de "Em investigação" fixo no código (apontado pelo próprio agente da visão geral).

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch feat/web-redesign, where the front-end redesign was just merged (all tests green). A review found three small defects. Fix exactly these, add or update tests, and change nothing else. You are running non-interactively (claude -p): do not ask questions; print a final report in Portuguese at the end.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/DESIGN.md. On-screen text and comments in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets.

1. The profile menu at the bottom of the sidebar (web/src/components/layout/sidebar.tsx) does not close on a real click outside it (checked in the browser: clicking the page title leaves `[role=menu]` open). It must close on pointerdown outside the menu and its trigger, and on Escape (returning focus to the trigger). Same for the account menu in the top bar (web/src/components/layout/account-menu.tsx) if it has the same problem.
2. With the assistant drawer open, the "Aparência" popover of the top bar (web/src/components/layout/header.tsx) opens UNDER the drawer. Fix the stacking so the popover is always above the drawer (and any other overlay that is open), without breaking the toasts' position next to the drawer.
3. "Em investigação" uses the hard-coded amber `#C98A1B` (web/src/features/alerts/components/dashboard.tsx and charts.tsx; grep the whole web/src for other hard-coded status colors). Add a `--warning` token to the theme engine (web/src/lib/theme/tokens.ts: a readable amber per base, e.g. light `#B7791F`, dark `#E0A96D`; keep contrast ≥ 3:1 against the card), register `--color-warning` in web/src/app/globals.css, set the Grafite default in console.css `:root`, document it in the tokens table of web/DESIGN.md, and replace every hard-coded use. Extend web/tests/theme.test.ts so every preset and custom config produces `--warning`.

Verification (report exact summaries): cd web && pnpm lint && pnpm test && pnpm build. If you can, check items 1 and 2 with a quick Playwright script against `pnpm dev -p 3015` (the proxy redirects to /login without a Supabase session; if it blocks you, say so and rely on the unit tests).
````
