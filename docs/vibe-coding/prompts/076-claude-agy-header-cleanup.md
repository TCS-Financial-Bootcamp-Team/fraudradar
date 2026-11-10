---
id: 076
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high; Claude Opus 5.5, Gemini 4 Argon e GPT-OSS do agy estavam sem cota)
pai: 075
data: 2026-11-10
---

# Delegação ao agy: topo limpo, semana e busca na fila, aprovação dentro do alerta

Decisões técnicas tomadas pelo Claude antes de delegar (reversíveis):

- A aprovação do rascunho ao COAF vai para o detalhe do alerta: sem isso, apagar `/reports` deixaria todo alerta encaminhado preso em "Para comunicação".
- A "busca" do topo era um texto fixo ("Busca global em breve"). Na fila ela vira busca de verdade por alerta ou conta, com o parâmetro `search` em `GET /alerts`.
- Visão geral e Monitoramento seguem a semana escolhida na fila e mostram qual é, com link para trocar.

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, on the branch feat/web-alerts-toolbar (already checked out). Before touching anything, read AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/API_CONTRACTS.md and api/AGENTS.md, and follow them. Code (identifiers, files, routes, JSON fields, query params) in English; every on-screen text, comment and doc in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/ (the orchestrator writes those). Do NOT run `docker compose down -v` or anything that deletes the database volume. Never print secrets from .env.

## Goal

The product owner wants a clean top bar and everything about choosing what to look at moved into the alert queue (/alerts). He also wants the /reports page gone.

## Tasks

1. Clean top bar — web/src/components/layout/header.tsx
   - Remove the "Semana de referência" label, the <WeekPicker /> and the "Busca global em breve" placeholder (and the divider that only separated them).
   - Keep: sidebar toggle (desktop and mobile), theme toggle, notifications, account menu. Nothing else.

2. Week picker lives only in /alerts
   - web/src/features/alerts/components/alert-queue.tsx already renders <WeekPicker /> in its filter bar; it becomes the only place to change the week. Keep the shared week in AppContext (web/src/components/app-context.tsx) as it is.
   - Dashboard (features/alerts/components/dashboard.tsx) and Monitoring (monitoring.tsx) keep following that shared week. In each page heading add a small read-only line "Semana de dd/mm/aaaa" with a link "trocar na fila de alertas" to /alerts, so the user knows which week is shown and where to change it. Keep the existing "Liberar próxima semana" button on the dashboard working (after a release the app already moves to the new week).

3. Week select is cutting the text
   - In week-picker.tsx the <Select> has a fixed `w-[150px]`; "Semana de 28/08/2023" plus the native arrow does not fit. Make the select size to its content (no truncation) at every breakpoint, including mobile widths (375px) inside the queue filter bar, without overflowing the bar. Check it really renders whole: take a Playwright screenshot or measure scrollWidth vs clientWidth of the select.

4. Real search in the queue (replaces the fake global search)
   - API: add an optional query param `search` to GET /alerts (api/routes/alerts.py and the queue repository in api/repositories/). Semantics: trimmed; if it is all digits, match alerts whose id equals it OR whose account starts with it; otherwise match account prefix only. Max length 40, min 1. It combines with week/status/country and with pagination; `total` reflects the filter; `countries` stays the unfiltered list for the week (as today). Use bound parameters only, never string-concatenate SQL. Update the route docstring, README route table if it lists the params, web/API_CONTRACTS.md and docs/glossary.md if a new cross-boundary name appears.
   - Tests: add cases to tests/api/test_queue.py (match by id, by account prefix, no match → empty with total 0, combined with status filter, too long → 422). Run with a dedicated test DB: TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_agy_test REQUIRE_TEST_DB=1 (the Postgres of docker compose is already running on 5432; the user/password are the compose defaults). Use 127.0.0.1, not localhost (on this Windows machine localhost makes the suite crawl).
   - Front: add a search input to the queue filter bar (label "Buscar", placeholder "Alerta ou conta"), wired component → hook → service → API like the other filters (features/alerts/{components,hooks,services,schemas}); debounce ~300 ms; reset to page 1 on change; "Limpar filtros" clears it too. Update the mock service so NEXT_PUBLIC_USE_MOCKS=true still works with the same semantics.

5. Remove /reports, keep the approval flow
   - The /reports page (web/src/app/(app)/reports/page.tsx and features/alerts/components/reports.tsx) is the only place where the COAF draft is reviewed and approved. Removing it without a replacement would leave every alert decided as "report" stuck in "Para comunicação". So: move the draft review into the alert detail page (alert-detail.tsx). When the alert has a report (status `report`, or GET /alerts/{id}/report returns one), show a section "Comunicação ao COAF" with the editable draft text, the academic-simulation notice that /reports shows today ("Ambiente acadêmico: nada é enviado de verdade…"), and the "Aprovar rascunho" button calling POST /alerts/{id}/report/approve; once approved show it read-only with "Revisão aprovada". Right after the analyst registers a "Preparar comunicação ao COAF" decision, the section must appear without a page reload.
   - Then delete the /reports route, reports.tsx, the "Comunicações" item in the sidebar (components/layout/sidebar.tsx) and the "Comunicações" link button in the alert detail header. Remove now-unused code/mocks/schemas only if nothing else uses them. The API endpoints for reports stay as they are.
   - Update tests that reference /reports or the sidebar items (web/tests/sidebar.test.ts, mock-flows.test.ts, etc.), and any doc listing the screens (README, web/AGENTS.md, .agents/skills/fraudradar-overview/SKILL.md and its copy .claude/skills/fraudradar-overview/SKILL.md must stay identical).

## Verification (all must pass; report the exact output summary)

- uv run ruff check . && uv run ruff format --check .
- uv run --group api --group ml pytest with the TEST_DATABASE_URL/REQUIRE_TEST_DB above (state how many passed/skipped; skipped API tests = not verified).
- cd web && pnpm lint && pnpm test && pnpm build (if build fails with TS2307 on .next/dev/types, delete web/.next and web/.next-test and retry).
- Visual check: run the web app in dev (cd web && pnpm dev, it reads web/.env.local which points to the real API on http://localhost:8000; if you need the API with your code, run `uv run --group api uvicorn api.main:app --port 8002` and point a temporary NEXT_PUBLIC_API_URL at it — do not edit web/.env.local permanently). If login blocks you, use NEXT_PUBLIC_USE_MOCKS=true for the visual check and say so.

## Final report

List: files changed, what each change does, test commands with results, anything not verified, and any decision you had to make that the product owner should know about. Keep the report in Portuguese.
````
