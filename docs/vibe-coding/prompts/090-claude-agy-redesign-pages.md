---
id: 090
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 083
data: 2026-11-10
---

# Delegação ao agy: fase 2 do redesenho — monitoramento, fontes, configurações, login e cadastro

Prompt enviado, na íntegra:

````text
You are one of FOUR agents working IN PARALLEL on PHASE 2 of the FraudRadar PLD front-end redesign. You work in your own git worktree at C:/codigo/pessoal/fr-wt-pages on branch feat/web-redesign-pages; the other agents work in other worktrees on other files. Stay strictly inside the files listed under "You own"; you may READ anything. If you believe a file you do not own must change, do not change it: write it in your final report under "Needs from other agents".

Phase 1 (already in your branch) built the foundation: the theme engine (web/src/lib/theme/, web/src/components/theme/), the restyled primitives (web/src/components/ui/*), the shared CSS classes (web/src/app/console.css, globals.css) and notifications (web/src/lib/notify.ts). Use them; do NOT edit web/src/components/ui/*, web/src/lib/theme/*, web/src/components/theme/*, web/src/lib/notify.ts, globals.css or console.css (except where your section explicitly allows it).

Read first, and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/API_CONTRACTS.md, api/AGENTS.md (if you touch the API) and web/DESIGN.md (the approved design spec). The approved prototype is in the MAIN checkout at C:\codigo\pessoal\fraudradar\trash\prototype\Main.dc.html (the whole app: every screen is a `<sc-if value="{{is.<screen>}}">` block), Login.dc.html and Cadastro.dc.html. They are plain HTML + inline styles; translate them to this codebase's stack (Next.js App Router, Tailwind v4 with the theme tokens, lucide-react icons with strokeWidth 1.5, component → hook → service → API). Never hard-code colors: use the tokens (bg-background, bg-card, text-muted-foreground, border-border, bg-primary, text-signal, bg-track, bg-chart-muted, border-soft, bg-sidebar, text-sidebar-muted, bg-topbar, ...). Keep every existing behavior and data flow working: this is a visual redesign, not a rewrite of the logic. Do not invent data: charts and numbers come from the API (or the mocks when NEXT_PUBLIC_USE_MOCKS=true).

Rules: code identifiers in English; on-screen text, comments and docs in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env or web/.env.local. Do not run `docker compose down -v` or anything that deletes data.

Setup in your worktree (once): `cd C:/codigo/pessoal/fr-wt-pages\web && pnpm install` (copy C:\codigo\pessoal\fraudradar\web\.env.local into C:/codigo/pessoal/fr-wt-pages\web\ if it is missing; it is git-ignored).

## Verification (report exact summaries)
- cd C:/codigo/pessoal/fr-wt-pages\web && pnpm lint && pnpm test && pnpm build (if build fails with TS2307 on .next/dev/types, delete .next and .next-test and retry).
- Visual check with Playwright on `pnpm dev -p 3014` run from C:/codigo/pessoal/fr-wt-pages\web with NEXT_PUBLIC_USE_MOCKS=true set only in that process (do not edit .env.local), at 1440px and 390px wide, in the Grafite and Escuro themes. Use your own port 3014; other agents use other ports. If the login blocks you in mocks, say so.

## Final report (Portuguese)
Files changed and why, test results, what was not verified, "Needs from other agents", and any decision the product owner should know. Only claim what is actually in the diff.

## Your part: Monitoramento, Fontes de dados, Configurações, login, cadastro and reset

You own: web/src/features/alerts/components/monitoring.tsx, web/src/features/ingestion/components/**, web/src/features/settings/components/**, web/src/features/health/components/health-panel.tsx, web/src/features/auth/components/**, web/src/app/(auth)/**, web/src/app/(app)/monitoring/**, web/src/app/(app)/ingestion/**, web/src/app/(app)/settings/**, and in web/src/app/console.css ONLY the auth-specific blocks (.auth-layout, .auth-brand, .radar-art) which you may restyle or delete. Do NOT edit schemas, services, hooks or mocks (consume what exists).

1. Monitoramento, following the prototype's `is.monitoramento` block: header with the week context line linking to /alerts and a one-line explanation; KPI strip (Recall da fila, Acerto de tipologia, Taxa de alerta, and any other indicator the API gives); cards "Taxa de alerta por país" and "Taxa de alerta por meio de pagamento" as horizontal bars with % values, bars ≥ a clear threshold in signal (pick one and state it), others primary; footnote that the answer key only enters after the queue is ready. Another agent is making `indicators.recall` and `indicators.typology_accuracy` nullable in parallel: write the display so that a null/absent value shows "—" with a short note ("sem gabarito nesta semana" / "aguarda o parecer da IA"); a value of exactly 0 for typology accuracy should also show "—" with "aguarda o parecer da IA" for now.
2. Fontes de dados, following `is.fontes`: two cards side by side — "Importar CSV" (keep the existing upload with progress, validation and receipts; restyle the drop zone: dashed border, upload icon, the real limits text from the code), "Conexões com bancos externos" (keep the current behavior; if the API answers 501, show it as "em breve" with the explanation) — and "Envios recentes" as a table if the existing screen has that data; keep the single-transaction form if it exists, restyled.
3. Configurações, following `is.config`: "Perfil" card (existing profile form), "Aparência" card embedding the Phase 1 ThemePreviewCards plus a "Personalizar cores" control that shows the full AppearancePanel inline, and "Sistema" card from the existing health panel (dots + labels, no badges). Remove anything that duplicated the old light/dark toggle.
4. Auth screens (login, signup, reset-password), following trash/prototype/Login.dc.html and Cadastro.dc.html: two columns (brand panel in the sidebar color with logo, headline, short text and three facts/steps; form on the other side), stacking on phones. Keep every existing auth behavior (Supabase calls, validation, errors, "manter conectado", redirects, password visibility). Signup gets the 4-segment password strength meter with the hint text. The brand panel must follow the saved theme (the Phase 1 provider wraps the whole app, so the tokens apply there too).
````
