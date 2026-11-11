---
id: 085
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 083
data: 2026-11-10
---

# Delegação ao agy: dados novos do /monitoring para a visão geral

O Pedro liberou quantas instâncias do agy fossem precisas. A API não depende da base visual (prompt 084), então roda em paralelo, num git worktree próprio (`../fr-wt-api`, branch `feat/web-redesign-api`). Também corrige o "Recall 0%" em semana sem gabarito, apontado no prompt 074.

Prompt enviado, na íntegra:

````text
You are working in a git worktree of the FraudRadar PLD repository at C:\codigo\pessoal\fr-wt-api, branch feat/web-redesign-api. Other agents are working in parallel in other folders; stay inside this worktree and inside the files listed below. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets. Do not run `docker compose down -v` or delete data.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/API_CONTRACTS.md. Code identifiers in English; comments, docs and messages that reach the screen in Brazilian Portuguese.

## Task: the data the redesigned dashboard needs, in GET /monitoring

You own: api/schemas/monitoring.py, api/routes/monitoring.py, the repository functions that build the monitoring payload (find them from the route; api/repositories/), tests/api/test_monitoring.py, the monitoring row/section of README.md and web/API_CONTRACTS.md, and on the front ONLY: monitoringSchema and its types in web/src/features/alerts/schemas/alerts.ts, fetchMonitoring in web/src/features/alerts/services/alerts-service.ts, monitoringMock in web/src/features/alerts/services/mocks.ts, useMonitoring in web/src/features/alerts/hooks/use-alerts.ts, and web/tests/contracts.test.ts if it checks this schema.

1. Additive fields on GET /monitoring?week= (existing fields keep their meaning), computed with SQL from tables the API already reads. The API never reads ground_truth: answer-key metrics come precomputed by the worker in weekly_batches.metrics.
   - `recall_series`: list of {name, value} for the RELEASED weeks up to the reference week, name formatted exactly like the existing `weeks` series labels, value = weekly_batches.metrics.recall (0–1). Weeks without recall (e.g. data that came from the CSV ingestion) are omitted.
   - `score_histogram`: the reference week's alerts bucketed by score*100 into bins named "40","50","60","70","80","90","95","100" = [<50), [50,60), [60,70), [70,80), [80,90), [90,95), [95,99.95), [99.95,100]; list of {name, value: count}, always all eight bins (zero allowed).
   - `status_counts`: object {pending, escalated, archived, reported} with the counts of the reference week's alerts.
2. `indicators.recall` and `indicators.typology_accuracy` become nullable: null when the week has no such metric (today the route turns a missing recall into 0.0 and the screen says "Recall 0%", which is wrong). Keep clamping when the value exists.
3. Front: update monitoringSchema (new fields; recall/typology_accuracy `.nullable()`), the mock (realistic values for every new field, so NEXT_PUBLIC_USE_MOCKS=true still renders), and make sure the current front still BUILDS: the existing monitoring.tsx and dashboard.tsx read those indicators; apply the minimal null-safe display change there ("—" when null) so `pnpm build` passes. Other agents will rewrite those two screens later; keep your change there to the minimum.
4. Tests in tests/api/test_monitoring.py: recall_series with and without recall weeks and only released weeks; score_histogram bins (including the 99.95 edge and a score below 0.40); status_counts; recall null when the batch has no recall. Update existing assertions that expected 0.0.

## Setup and verification (report exact summaries)
- `uv sync --all-groups` in the worktree.
- `uv run ruff check . && uv run ruff format --check .`
- `TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_api_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest` (the Postgres of docker compose is already running on 5432; 0 skipped expected).
- `cd web && pnpm install && pnpm lint && pnpm test && pnpm build` (copy C:\codigo\pessoal\fraudradar\web\.env.local into web\ first if missing; it is git-ignored).

Final report in Portuguese: files changed, the exact JSON shape of the new fields, test results, what was not verified. Only claim what is actually in the diff.
````
