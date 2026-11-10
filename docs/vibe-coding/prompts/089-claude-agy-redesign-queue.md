---
id: 089
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 083
data: 2026-11-10
---

# Delegação ao agy: fase 2 do redesenho — fila e detalhe do alerta

Prompt enviado, na íntegra:

````text
You are one of FOUR agents working IN PARALLEL on PHASE 2 of the FraudRadar PLD front-end redesign. You work in your own git worktree at C:/codigo/pessoal/fr-wt-queue on branch feat/web-redesign-queue; the other agents work in other worktrees on other files. Stay strictly inside the files listed under "You own"; you may READ anything. If you believe a file you do not own must change, do not change it: write it in your final report under "Needs from other agents".

Phase 1 (already in your branch) built the foundation: the theme engine (web/src/lib/theme/, web/src/components/theme/), the restyled primitives (web/src/components/ui/*), the shared CSS classes (web/src/app/console.css, globals.css) and notifications (web/src/lib/notify.ts). Use them; do NOT edit web/src/components/ui/*, web/src/lib/theme/*, web/src/components/theme/*, web/src/lib/notify.ts, globals.css or console.css (except where your section explicitly allows it).

Read first, and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/API_CONTRACTS.md, api/AGENTS.md (if you touch the API) and web/DESIGN.md (the approved design spec). The approved prototype is in the MAIN checkout at C:\codigo\pessoal\fraudradar\trash\prototype\Main.dc.html (the whole app: every screen is a `<sc-if value="{{is.<screen>}}">` block), Login.dc.html and Cadastro.dc.html. They are plain HTML + inline styles; translate them to this codebase's stack (Next.js App Router, Tailwind v4 with the theme tokens, lucide-react icons with strokeWidth 1.5, component → hook → service → API). Never hard-code colors: use the tokens (bg-background, bg-card, text-muted-foreground, border-border, bg-primary, text-signal, bg-track, bg-chart-muted, border-soft, bg-sidebar, text-sidebar-muted, bg-topbar, ...). Keep every existing behavior and data flow working: this is a visual redesign, not a rewrite of the logic. Do not invent data: charts and numbers come from the API (or the mocks when NEXT_PUBLIC_USE_MOCKS=true).

Rules: code identifiers in English; on-screen text, comments and docs in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env or web/.env.local. Do not run `docker compose down -v` or anything that deletes data.

Setup in your worktree (once): `cd C:/codigo/pessoal/fr-wt-queue\web && pnpm install` (copy C:\codigo\pessoal\fraudradar\web\.env.local into C:/codigo/pessoal/fr-wt-queue\web\ if it is missing; it is git-ignored).

## Verification (report exact summaries)
- cd C:/codigo/pessoal/fr-wt-queue\web && pnpm lint && pnpm test && pnpm build (if build fails with TS2307 on .next/dev/types, delete .next and .next-test and retry).
- Visual check with Playwright on `pnpm dev -p 3013` run from C:/codigo/pessoal/fr-wt-queue\web with NEXT_PUBLIC_USE_MOCKS=true set only in that process (do not edit .env.local), at 1440px and 390px wide, in the Grafite and Escuro themes. Use your own port 3013; other agents use other ports. If the login blocks you in mocks, say so.

## Final report (Portuguese)
Files changed and why, test results, what was not verified, "Needs from other agents", and any decision the product owner should know. Only claim what is actually in the diff.

## Your part: the alert queue (/alerts) and the alert detail (/alerts/[id])

You own: web/src/features/alerts/components/alert-queue.tsx, alerts-table.tsx, week-picker.tsx, alert-detail.tsx, account-graph.tsx, web/src/lib/risk.ts, web/src/app/(app)/alerts/**, and tests web/tests/risk.test.ts (plus new tests for your code). Do NOT edit schemas, services, hooks or mocks of the alerts feature (other agents own parts of them); consume what exists.

1. Queue, following the prototype's `is.fila` block: header (context "Triagem semanal", title "Fila de alertas") with the week stepper on the right (‹ select ›, label "Semana" above the value, full text never truncated, only released weeks — reuse WeekPicker logic); status as underline tabs with counts (Todos, Pendentes, Em investigação, Para comunicação, Arquivados) — counts: use what the queue response gives; if per-status counts are not available, show the tabs without counts rather than inventing them; search input "Buscar alerta ou conta" (keep the existing debounce and the API `search` param) and the country select on the right of the tabs; the table inside a card (Pos., Alerta as link, Conta in mono, Nota de risco = number + 72×4 bar in signal when ≥ 98, Tipologia muted, País, Valor right-aligned, Status as dot + text); empty state "Nenhum alerta com esses filtros. Limpar filtros"; pagination text "1–10 de N alertas · semana de dd mmm aaaa" with Anterior/Próxima. Fix the existing "1 alertas encontrados" plural while you are there.
2. Alert detail, following the prototype's `is.alerta` block: back link "Fila · semana de dd mmm aaaa"; header with status pill (dot + label), queue position · country, title "Alerta <id>" + account in mono, and the three numbers on the right (Nota de risco in signal when ≥ 98, Volume na semana, Movimentações); left column cards: "Por que entrou na fila" (contributions as horizontal bars with %), "Regras acionadas" (keep; empty state minimal), "Movimentações da semana" (table), "Conexões" (account-graph restyled with theme tokens: center node primary, alert nodes signal, others outlined; keep the text alternative); right column: "Parecer da IA" card (existing generate action; the API answers 503 today and the user must see the API message via the existing error path), "Decisão" card (segmented control Arquivar / Aprofundar / Comunicar ao COAF instead of the select, justification textarea, "Registrar decisão"; keep react-hook-form + zod validation and the lock after approval with its note), "Comunicação ao COAF" card (keep the existing ReportSection behavior: editable draft, academic notice, approve, approved state). REMOVE the inline chat panel ("Converse sobre este caso") from the alert page: the assistant becomes a drawer in the top bar (another agent) that picks the alert context from the URL. Remove the `Chat` import accordingly.
````
