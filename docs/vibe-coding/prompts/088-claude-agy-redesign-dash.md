---
id: 088
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 083
data: 2026-11-10
---

# Delegação ao agy: fase 2 do redesenho — visão geral

Prompt enviado, na íntegra:

````text
You are one of FOUR agents working IN PARALLEL on PHASE 2 of the FraudRadar PLD front-end redesign. You work in your own git worktree at C:/codigo/pessoal/fr-wt-dash on branch feat/web-redesign-dash; the other agents work in other worktrees on other files. Stay strictly inside the files listed under "You own"; you may READ anything. If you believe a file you do not own must change, do not change it: write it in your final report under "Needs from other agents".

Phase 1 (already in your branch) built the foundation: the theme engine (web/src/lib/theme/, web/src/components/theme/), the restyled primitives (web/src/components/ui/*), the shared CSS classes (web/src/app/console.css, globals.css) and notifications (web/src/lib/notify.ts). Use them; do NOT edit web/src/components/ui/*, web/src/lib/theme/*, web/src/components/theme/*, web/src/lib/notify.ts, globals.css or console.css (except where your section explicitly allows it).

Read first, and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/API_CONTRACTS.md, api/AGENTS.md (if you touch the API) and web/DESIGN.md (the approved design spec). The approved prototype is in the MAIN checkout at C:\codigo\pessoal\fraudradar\trash\prototype\Main.dc.html (the whole app: every screen is a `<sc-if value="{{is.<screen>}}">` block), Login.dc.html and Cadastro.dc.html. They are plain HTML + inline styles; translate them to this codebase's stack (Next.js App Router, Tailwind v4 with the theme tokens, lucide-react icons with strokeWidth 1.5, component → hook → service → API). Never hard-code colors: use the tokens (bg-background, bg-card, text-muted-foreground, border-border, bg-primary, text-signal, bg-track, bg-chart-muted, border-soft, bg-sidebar, text-sidebar-muted, bg-topbar, ...). Keep every existing behavior and data flow working: this is a visual redesign, not a rewrite of the logic. Do not invent data: charts and numbers come from the API (or the mocks when NEXT_PUBLIC_USE_MOCKS=true).

Rules: code identifiers in English; on-screen text, comments and docs in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env or web/.env.local. Do not run `docker compose down -v` or anything that deletes data.

Setup in your worktree (once): `cd C:/codigo/pessoal/fr-wt-dash\web && pnpm install` (copy C:\codigo\pessoal\fraudradar\web\.env.local into C:/codigo/pessoal/fr-wt-dash\web\ if it is missing; it is git-ignored).

## Verification (report exact summaries)
- cd C:/codigo/pessoal/fr-wt-dash\web && pnpm lint && pnpm test && pnpm build (if build fails with TS2307 on .next/dev/types, delete .next and .next-test and retry).
- Visual check with Playwright on `pnpm dev -p 3012` run from C:/codigo/pessoal/fr-wt-dash\web with NEXT_PUBLIC_USE_MOCKS=true set only in that process (do not edit .env.local), at 1440px and 390px wide, in the Grafite and Escuro themes. Use your own port 3012; other agents use other ports. If the login blocks you in mocks, say so.

## Final report (Portuguese)
Files changed and why, test results, what was not verified, "Needs from other agents", and any decision the product owner should know. Only claim what is actually in the diff.

## Your part: the dashboard (Visão geral)

You own: web/src/features/alerts/components/dashboard.tsx, web/src/features/alerts/components/charts.tsx, web/src/app/(app)/dashboard/**, and new test files for your code. Do NOT edit schemas, services, hooks, mocks or the API: GET /monitoring already returns, besides the old fields, `recall_series` [{name, value 0–1}] for released weeks with an answer key, `score_histogram` [{name: "40"…"100", value}] with eight bins, `status_counts` {pending, escalated, archived, reported}, and `indicators.recall` / `indicators.typology_accuracy` are now nullable (null = no metric for that week). Read web/src/features/alerts/schemas/alerts.ts for the exact types.

Build, following the prototype's `is.dashboard` block and web/DESIGN.md: header (context line "Semana de dd mmm a dd mmm aaaa · trocar na fila" linking to /alerts, title "Visão geral", the existing health badge, "Liberar próxima semana" with the existing replay hook and its hint of the next release); the KPI strip (Alertas na semana, Taxa de alerta, Valor sinalizado, Recall da fila — recall shows "—" with "sem gabarito nesta semana" when null) with sparklines from `weeks` and `recall_series`; then the cards: "Alertas por semana" (bars, current week primary, the others chart-muted, value labels), "Recall da fila" (line with the 95% target as a dashed signal line; a minimal empty state when the series is empty), "Distribuição da nota de risco" (histogram, the "100" bin in signal, note "N alertas empatam em 100: quem desempata é a posição na fila." with the real N), "Andamento da revisão" (reviewed of total as a big number, progress bar, the four status counts with dots), "Meio de pagamento" and "País" (horizontal bars from what the API gives: payment_type_rates / countries), and "Comece por aqui" (top 5 of the queue with the existing hook, restyled table, alert id links to the detail). Use Recharts (already a dependency) restyled per DESIGN.md, or plain divs for the simple bars; one series per chart, never two axes, hover shows the value.
````
