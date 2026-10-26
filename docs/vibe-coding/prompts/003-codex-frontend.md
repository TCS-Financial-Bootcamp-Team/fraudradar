---
id: 003
area: frontend
autor: Claude Code
destino: Codex (conta1, escritor)
pai: 002
data: 2026-10-26
modelo: gpt-6.1-sol / reasoning high
---

You are implementing the FraudRadar PLD web frontend in `web/` (Next.js 16.4 App Router, React 19.3, Tailwind v4, shadcn on @base-ui/react, next-themes, sonner, recharts, lucide-react, pnpm). Repo root: C:\codigo\pessoal\fraudradar. Windows.

READ FIRST: `AGENTS.md`, `web/AGENTS.md`, and the relevant guides in `web/node_modules/next/dist/docs/` (this Next version has breaking changes: e.g. `proxy.ts` replaces middleware, `LayoutProps`/`PageProps` globals, async params/cookies). Follow the existing pattern in `web/src/features/saude/` (component -> hook -> service -> API; components never fetch). UI text, identifiers for domain concepts, and comments in PT-BR. Match the existing code style.

## Product
Anti-money-laundering monitoring for compliance analysts (SAML-D dataset). Backend is a FastAPI at `NEXT_PUBLIC_API_URL` (see `web/src/lib/api.ts`). The LLM key lives only in the API; the browser never calls an LLM or a database directly. Planned API endpoints: `GET /alertas?semana=&status=&pais=`, `GET /alertas/{id}`, `GET /alertas/{id}/grafo`, `POST /alertas/{id}/parecer`, `POST /alertas/{id}/decisao`, `GET /alertas/{id}/comunicacao`, `POST /alertas/{id}/comunicacao/aprovar`, `POST /alertas/{id}/chat`, `POST /replay/proxima-semana`, `GET /monitoramento`, `GET /saude`. New ones this front will need (define the contract in zod schemas, the API team implements later): `POST /ingestao/csv` (multipart), `POST /ingestao/transacoes` (JSON, manual form), `POST /ingestao/conexoes` + `GET /ingestao/conexoes` (register an external Postgres source by connection string; the API stores/uses it, the browser only sends it once over HTTPS and never displays it back — show masked host/db only), `POST /chat` (global assistant). Transaction fields (SAML-D): Time, Date, Sender_account, Receiver_account, Amount, Payment_currency, Received_currency, Sender_bank_location, Receiver_bank_location, Payment_type. NEVER include Is_laundering/Laundering_type in any form or CSV schema.

Since most endpoints don't exist yet, each service must call the real API through `lib/api.ts` (add `apiPost`/multipart helper) and, ONLY when `NEXT_PUBLIC_USE_MOCKS=true`, return realistic mock data from `src/features/<mod>/services/mocks.ts`. Default `.env.example` value: true. This lets the demo run before the API is ready.

## Auth (Supabase)
Use `@supabase/supabase-js` + `@supabase/ssr`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (add both to root `.env.example` and a `web/.env.example`; never a service-role key in the front). Browser + server clients in `src/lib/supabase/`. `proxy.ts` refreshes the session and redirects unauthenticated users from the app area to `/login`, and logged-in users away from `/login`/`/cadastro`. Screens: `/login` (email+password, "esqueci a senha" link to `/recuperar-senha`), `/cadastro` (nome, e-mail, senha + confirmação, strength hint; stores nome in user_metadata), `/recuperar-senha`, and `/auth/callback` route for email confirmation. Forms with react-hook-form + zod; errors via sonner toast, never alert(). If the Supabase env vars are missing, show a clear setup message instead of crashing.

## App screens (route group `(app)` with a shell: collapsible sidebar, topbar with week selector, global search placeholder, theme toggle, notifications bell, user menu with logout)
1. `/dashboard` (main page, `/` redirects here when logged in): KPI cards (alertas da semana, revisados, comunicados ao COAF, taxa de alerta, valor total sinalizado), alerts-per-week area chart, typology donut, top countries bar, recent alerts table, "Processar próxima semana" button (POST /replay/proxima-semana) with loading state, system health badge reusing the `saude` feature.
2. `/alertas`: queue table sorted by score with filters (status, país, semana), score as colored bar, pagination, row -> detail.
3. `/alertas/[id]`: score, top feature contributions (horizontal bar), triggered rules, account transactions table, 2-hop graph (cytoscape, already installed), "Gerar parecer" with cited sources, case chat panel, decision form (arquivar / aprofundar / comunicar, justificativa obrigatória).
4. `/comunicacoes`: COAF drafts list + editable draft + approve (state clearly "nada é enviado de verdade").
5. `/monitoramento`: recall da fila, acerto de tipologia do LLM, taxa de alerta por país e por meio de pagamento (charts).
6. `/ingestao` with 3 tabs: (a) CSV upload with drag&drop, client-side header validation and 20-row preview (use papaparse; stream/preview only, do not parse huge files fully in the browser), upload progress; (b) Conexão com banco: form (nome, tipo Postgres, connection string or host/porta/db/usuário/senha, SSL) + list of registered sources with status/última sincronização and "sincronizar" action; (c) Formulário manual: one transaction with validated fields, searchable selects for currency/location/payment type, and a list of the entries submitted in this session.
7. Floating AI assistant (available on every app page): slide-over chat panel, message list with markdown-ish rendering, suggested prompts ("Resuma os alertas da semana", "Explique a tipologia fan-out"...), loading/typing state, calls `POST /chat` with the current page context. Show a notice that account numbers are pseudonymized.
8. `/configuracoes`: profile (nome), theme preference, API URL/health info.
Extras: loading skeletons, empty states, error boundaries (`error.tsx`, `not-found.tsx`), responsive down to 375px, keyboard focus states, aria labels, `prefers-reduced-motion` respected.

## Visual direction
Modern professional fintech/compliance console. Light and dark themes via next-themes (class strategy, system default, toggle in topbar and on auth pages). Define all colors as CSS variables in `globals.css` (Tailwind v4 `@theme inline`): deep navy/ink neutrals, a single confident accent (teal/emerald) for primary actions, semantic risk scale (low/medium/high/critical) usable in both themes with AA contrast. Tabular numbers for money/scores, BRL/locale formatting via Intl, subtle borders over heavy shadows, 8px spacing rhythm, Geist fonts already set. Auth pages: split layout with a brand panel (logo mark built with lucide `Radar`, short value proposition, subtle grid/gradient) and the form card. No stock-template look; consistent radius, density suitable for analysts.

## Constraints
- Add shadcn components you need via the existing `components.json` (`pnpm dlx shadcn@latest add ...`) or write them in `src/components/ui/` in the same style.
- Strict TypeScript, no `any`. Types from zod schemas.
- Do not touch `api/`, `worker/`, `src/fraudradar/`, `db/`.
- Finish with `cd web && pnpm lint && pnpm build` both passing. Fix what fails.
- At the end print: files created/changed (grouped), new env vars, new API contracts assumed, and anything you could not finish or decisions you made that the product owner should validate.
