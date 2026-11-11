---
id: 079
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 076
data: 2026-11-10
---

# Delegação ao agy: correções da revisão do prompt 076

O Claude revisou o diff da primeira rodada e achou três defeitos (500 na busca com dígitos não ASCII ou número acima do bigint; relatório buscado em todo alerta, com erro engolido; formulário de decisão aberto depois da aprovação, que o relatório do agy dizia ter feito e não estava no diff).

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch feat/web-alerts-toolbar, which already contains your previous (uncommitted) work: search on GET /alerts, clean header, week picker only in /alerts, /reports removed and the COAF draft review moved into the alert detail. Follow AGENTS.md, web/AGENTS.md and api/AGENTS.md as before. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env.

A code review found three defects. Fix exactly these, add tests, and do not change anything else.

1. GET /alerts `search` can return 500 (api/repositories/alert_queue.py)
   - `search_term.isdigit()` is True for non-ASCII digits like "²" or "٣", and `int("²")` raises ValueError → 500. Use `search_term.isascii() and search_term.isdigit()`.
   - A numeric search of 19–40 digits passes validation, `int()` produces a value larger than PostgreSQL bigint and the query fails → 500. Only add the `a.id = :search_id` condition when the integer fits in a signed 64-bit (<= 9223372036854775807); the account-prefix condition still applies.
   - Remove the duplicated `.strip()` (it is done both in the route and in the repository; keep it in one place).
   - Tests in tests/api/test_queue.py: a 40-digit numeric search returns 200 with an empty list; a search of "²" returns 200 with an empty list.

2. The alert detail fetches the report for every alert (web/src/features/alerts/hooks/use-alerts.ts, useAlertDetail)
   - Today it calls fetchReport for every alert and swallows any error with try/catch, so every alert without a decision produces a 404 in the console, and a real 500 would be hidden. Fetch the report only when `detail.status === "reported"` (the API only lets a report be approved in that status, see api/repositories/decisions.py) and let errors propagate like the other loads. Keep the mock service consistent (alerts with status "reported" in mocks must have a report).

3. The decision form is not locked after the report is approved (web/src/features/alerts/components/alert-detail.tsx)
   - POST /alerts/{id}/decision returns 409 "A comunicação deste alerta já foi aprovada." after approval, but the form stays enabled, so the analyst only discovers it by getting an error. When `report?.status === "approved"`, disable the decision select, the textarea and the submit button, and show one line under the form: "A comunicação deste alerta já foi aprovada; a decisão está encerrada." Your previous report claimed this was done, but it is not in the diff.

## Verification (report the exact summaries)
- uv run ruff check . && uv run ruff format --check .
- TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_agy_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest tests/api (then the full suite)
- cd web && pnpm lint && pnpm test && pnpm build

Final report in Portuguese: files changed, test results, anything not verified. Only claim what is actually in the diff.
````
