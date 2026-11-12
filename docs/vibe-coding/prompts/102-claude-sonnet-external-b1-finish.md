---
id: 102
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code (conta 2 do Pedro, Sonnet)
pai: 099
data: 2026-11-11
---

# Delegação ao Sonnet: terminar o B1 que o Codex deixou pela metade

O Codex (099) parou no limite de 5 h da conta 2 com 57 arquivos alterados; o limite só voltava às 13:48. O Claude passou a continuação ao Sonnet (mesmo caminho que o Pedro escolheu no 092).

Prompt enviado (o do 099 com um aviso no topo):

````text
IMPORTANT CONTEXT: a previous agent (Codex) started this exact task in this worktree and stopped midway (usage limit). It already changed ~57 files. Before doing anything, run `git status` and `git diff` here, judge what it did, keep what is correct, fix what is not, and FINISH the task below. Meanwhile the two other lanes finished: B2 defined `PRE_PROCESS_HOOKS` in its own branch and needs `process` to call each hook with (engine, dataset) before processing, and needs the ingestions.source CHECK to include connection and simulation — make sure your branch does both.

You are one of THREE agents working IN PARALLEL in separate git worktrees of the FraudRadar PLD repository. Yours is C:/codigo/pessoal/fr-wt-b1 on branch feat/external-b1. You are running non-interactively: do not ask questions; print a final report in Portuguese at the end.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/DESIGN.md, web/API_CONTRACTS.md, docs/glossary.md, and above all docs/external-data.md — the design approved by the product owner; implement YOUR section of it exactly. Phase A (datasets per Postgres schema with X-Dataset / --dataset, public.jobs and `worker serve`) is already in your branch: read src/fraudradar/datasets.py, worker/jobs.py, api/dependencies.py and db/init/003_platform.sql before starting.

Ownership: stay inside "You own"; you may READ anything. If something outside must change, do not change it: list it under "Needs from other agents" in the report. The other two agents own: B2 = external connections/compatibility/import (src/fraudradar/sources, db/init/005, ingestion connections routes and UI); C = retraining and promotion (src/fraudradar/model, worker/train_job.py, models routes, monitoring.tsx).

Rules: code identifiers in English; comments, docs, logs and on-screen text in Brazilian Portuguese. Features and scoring live only in src/fraudradar. The model never reads ground_truth / Is_laundering / Laundering_type for scoring. Never print secrets. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never run `docker compose down -v` or touch the real database: tests use only databases ending in `_test`.

Setup (once): `uv sync --all-groups` in C:/codigo/pessoal/fr-wt-b1; `cd C:/codigo/pessoal/fr-wt-b1/web && pnpm install` (web/.env.local is already there).

Verification (report exact summaries; 0 skipped expected):
- uv run ruff check . && uv run ruff format --check .
- TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_b1_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest
- cd web && pnpm lint && pnpm test && pnpm build

Final report (Portuguese): files changed, decisions you had to take, test results, what was not verified, "Needs from other agents". Only claim what is actually in the diff.

## Your part (B1): continuous processing, "Contas suspeitas", the simulator and "Processar agora"

docs/external-data.md sections: "Unidade de análise e períodos", "Contas suspeitas", "Processamento automático", "Simulador de transações".

You own: worker/batch.py, worker/cli.py, worker/jobs.py (process + simulate handlers, the scheduler, stale-job recovery, and a `PRE_PROCESS_HOOKS` registry — see below), new src/fraudradar/data/simulation.py, db/init/002_tables.sql ONLY to add `ingestions.source` (TEXT NOT NULL DEFAULT 'api', CHECK IN ('csv','api','simulation','connection'); keep current values working), new db/init/004_processing.sql (public.processing_settings), API: routes/repositories/schemas for weeks, replay, monitoring week list if needed, new accounts/suspicious, processing settings, simulate, DELETE /ingestions/{id} (simulation only), POST /datasets/{slug}/process (already exists: keep), api/main.py router list; front: web/src/features/accounts/** (new), web/src/features/alerts/components/dashboard.tsx, alert-detail.tsx (only the new "Outras semanas desta conta" card), web/src/features/alerts/{hooks,services,schemas,mocks} for weeks/replay changes, web/src/features/processing/** (new: Processar agora, status of the running job, last/next run, simulator dialog), web/src/components/layout/sidebar.tsx (nav), web/src/app/(app)/accounts/**, web/src/app/page.tsx or the post-login redirect (home = /accounts), web/src/features/settings/components/settings.tsx ONLY to add the "Processamento" card (interval, enabled, demo mode), tests for all of this, README/API_CONTRACTS/glossary rows for your routes.

Key requirements:
- Open-period recompute exactly as the doc says (decided alerts frozen; undecided replaced; no duplicate alert for an account with a decision in that week); closed weeks never change; a later week closes the previous one. Remove the release gate: every processed week is visible (GET /weeks lists all processed weeks; `current` = latest). Remove "Liberar próxima semana" from the UI; POST /replay/next-week may stay for compatibility but nothing in the UI calls it.
- Scheduler inside `worker serve`: per dataset, enqueue `process` when next_run_at passes and none is queued/running for that dataset; update last/next run. Stale `running` > 2 h → failed "Trabalho interrompido".
- `PRE_PROCESS_HOOKS: list[Callable[[Engine, Dataset], None]]` in worker/jobs.py, called at the start of every `process` job (another agent registers the external-source puller there). Keep it empty by default.
- Simulator: realistic resampling after the last date of the dataset between existing accounts, optional fan-out pattern, one ingestion row with source='simulation', never ground truth; then enqueue process. DELETE of a simulation ingestion removes its transactions and recomputes the affected open period (refuse if any of its weeks are closed or have decisions on alerts touched by it — explain in Portuguese).
- "Contas suspeitas" page as the first nav item and default route; dashboard stays as "Visão geral" (remove the release button, add "Processar agora" + last/next run).
- Front polls GET /jobs/{id} while a job runs (every 2 s, stop on done/failed) and notifies at the end; refresh data via the app context.
- Tests: open-week recompute keeps decided alerts; closed weeks untouched; scheduler enqueues once; stale recovery; simulator output (count, dates after last date, accounts exist, source flag, no ground truth); suspicious accounts aggregation and ordering; DELETE simulation guard; front tests for the job polling and accounts list.
````
