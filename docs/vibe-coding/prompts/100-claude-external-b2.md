---
id: 100
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code (conta 2 do Pedro, Sonnet)
pai: 098
data: 2026-11-11
---

# Delegação ao Sonnet: conexões com bancos externos, compatibilidade e importação

Prompt enviado, na íntegra:

````text
You are one of THREE agents working IN PARALLEL in separate git worktrees of the FraudRadar PLD repository. Yours is C:/codigo/pessoal/fr-wt-b2 on branch feat/external-b2. You are running non-interactively: do not ask questions; print a final report in Portuguese at the end.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/DESIGN.md, web/API_CONTRACTS.md, docs/glossary.md, and above all docs/external-data.md — the design approved by the product owner; implement YOUR section of it exactly. Phase A (datasets per Postgres schema with X-Dataset / --dataset, public.jobs and `worker serve`) is already in your branch: read src/fraudradar/datasets.py, worker/jobs.py, api/dependencies.py and db/init/003_platform.sql before starting.

Ownership: stay inside "You own"; you may READ anything. If something outside must change, do not change it: list it under "Needs from other agents" in the report. The other two agents own: B1 = continuous processing, suspicious accounts, simulator, scheduler (worker/batch.py, worker/jobs.py except your two registrations, db/init/002 and 004, accounts/processing/weeks routes and UI, sidebar, dashboard, settings Processamento card); C = retraining and promotion (src/fraudradar/model, worker/train_job.py, models routes, monitoring.tsx).

Rules: code identifiers in English; comments, docs, logs and on-screen text in Brazilian Portuguese. Features and scoring live only in src/fraudradar. The model never reads ground_truth / Is_laundering / Laundering_type for scoring. Never print secrets. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never run `docker compose down -v` or touch the real database: tests use only databases ending in `_test`.

Setup (once): `uv sync --all-groups` in C:/codigo/pessoal/fr-wt-b2; `cd C:/codigo/pessoal/fr-wt-b2/web && pnpm install` (web/.env.local is already there).

Verification (report exact summaries; 0 skipped expected):
- uv run ruff check . && uv run ruff format --check .
- TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_b2_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest
- cd web && pnpm lint && pnpm test && pnpm build

Final report (Portuguese): files changed, decisions you had to take, test results, what was not verified, "Needs from other agents". Only claim what is actually in the diff.

## Your part (B2): external Postgres connections, compatibility check and import

docs/external-data.md sections: "Conexões externas", "Teste e relatório de compatibilidade", "As duas perguntas ao conectar".

You own: new src/fraudradar/sources/** (connection handling, encryption, compatibility report, incremental reader), new db/init/005_connections.sql (public.external_connections), api/routes/ingestion.py (the /ingestion/connections routes: replace the 501 stubs), api/repositories + api/schemas for connections, src/fraudradar/config.py (add CONNECTIONS_SECRET_KEY and EXTERNAL_DB_ALLOWED_HOSTS settings), .env.example (document both, with a dev hint), pyproject.toml/uv.lock ONLY if you need `cryptography` in the api group (prefer it; it is likely already present via pyjwt[crypto]), a new worker module worker/import_job.py with the `import` handler (register it in worker/jobs.py DEFAULT_HANDLERS and append your source puller to `PRE_PROCESS_HOOKS` there — another agent is adding that list in parallel: if it does not exist in your branch, create it as `PRE_PROCESS_HOOKS: list = []` right above DEFAULT_HANDLERS and call nothing else in jobs.py; the merge will reconcile), front web/src/features/ingestion/** (the connections part of the page), tests.

Key requirements:
- Create/list/test/delete connections. Password write-only, Fernet-encrypted with CONNECTIONS_SECRET_KEY (refuse to save when the key is missing, with a Portuguese message); never returned, never logged. Host must be in EXTERNAL_DB_ALLOWED_HOSTS (empty = refuse all). Every external read: READ ONLY transaction, connect_timeout and statement_timeout short, fixed SAML-D column list, table name validated as identifier ([schema.]table) and quoted.
- POST /ingestion/connections/{id}/test → compatibility report exactly as the doc lists (columns/types missing or wrong, has ground truth, row count, date range, sample of ≤1000 rows validated with src/fraudradar/data/ingestion.py validators, overlap with the CURRENT dataset: % of sample accounts already known, dates continue/overlap/other era) + a suggestion, never a decision.
- POST /ingestion/connections/{id}/import with {relation: "extend"|"new_dataset", new_dataset?: {name, slug}, mode: "history"|"follow"|"both", control_column} → validates (extend with dates crossing closed weeks is refused), creates the dataset when needed (use fraudradar.datasets.create_dataset), stores mode/position, enqueues `import` (history) and then `process`. The import handler reads in batches with progress, writes transactions (+ ground_truth when the source has Is_laundering, ONLY into ground_truth), one ingestions row with source='connection'.
- The PRE_PROCESS_HOOK, for datasets with a "follow"/"both" connection, reads only rows after the stored position (control column) and appends them before processing.
- Front, Fontes de dados → "Conexões com bancos externos" card becomes real: list, "Nova conexão" form (name, host, port, database, user, password, table, control column), "Testar" showing the report clearly (pass/fail per item, has ground truth, overlap and suggestion), then the two questions (Relação: "Continua os dados atuais" / "Outro dataset com a mesma estrutura" with name+slug; Processamento: "Analisar o histórico agora" / "Acompanhar só o que entrar" / "Os dois"), confirm → shows the job progress (GET /jobs/{id}). Follow web/DESIGN.md.
- Tests: encryption round trip and no password in responses/logs; allowed hosts; identifier validation (injection attempts); compatibility report against a real second test database/schema you create inside the test Postgres (e.g. a schema with a fake source table — still in a *_test database); import extend vs new_dataset; follow puller reads only new rows; front tests for the form and report.
````
