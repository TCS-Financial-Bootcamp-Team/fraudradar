---
id: 097
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Codex CLI (conta 2 do Pedro)
pai: 095
data: 2026-11-11
---

# Delegação ao Codex: fase A dos bancos externos (conjuntos de dados e trabalhos em segundo plano)

Decisões do Pedro (perguntas do Claude no chat): os dados externos recebem nota do modelo em uso e **o retreino só acontece quando a base trouxer gabarito**, gerando versão nova que só vira oficial depois de comparada; uma base que não continua os dados atuais vira **conjunto separado**. O desenho técnico (um schema do Postgres por conjunto, `X-Dataset`, fila `jobs` com `worker serve`, senha cifrada, lista de hosts permitidos contra SSRF) foi decidido pelo Claude e está em `docs/external-data.md`. Fases seguintes: B (conexões, compatibilidade e importação) e C (retreino e promoção).

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch feat/external-datasets (already checked out). You are Codex running non-interactively: do not ask questions; print a final report in Portuguese at the end.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/DESIGN.md, web/API_CONTRACTS.md, docs/glossary.md, and above all docs/external-data.md (the design approved by the product owner; it is untracked in this branch, do not delete it). Code identifiers in English; comments, docs, logs and on-screen text in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env. Do not run `docker compose down -v` or delete the existing database; use only test databases ending in `_test`.

## Task: PHASE A of docs/external-data.md — datasets platform and background jobs

This phase only builds the platform. External connections, the compatibility check, imports and retraining come in later phases (other agents), so do not build those, but leave clean extension points.

1. Database
   - New `db/init/003_platform.sql` (runs after 002 on a fresh volume): `public.datasets` (slug PK `[a-z0-9-]{1,40}` with a CHECK, name, schema_name UNIQUE, origin `saml-d`|`external`, active_model_version nullable, created_at) seeded with (`saml-d`, 'SAML-D', 'public', 'saml-d'); `public.jobs` (id, kind `import`|`process`|`train`, dataset slug FK, payload JSONB, status `queued`|`running`|`done`|`failed`, progress 0–100, message, created_by, created_at, started_at, finished_at) with an index for picking the next queued job.
   - The data tables of 002_tables.sql must be creatable in ANY schema: make sure nothing in 002 hard-codes `public.` and that it can be applied with `SET search_path TO <schema>, public` (pgvector types live in public). Put the "create dataset" logic in `src/fraudradar/datasets.py`: validate slug, derive `ds_<slug with - → _>`, `CREATE SCHEMA`, apply the data DDL inside it, insert the registry row — all in one transaction. Schema names enter SQL only via a strict identifier validation plus quoting, never from raw user text.
   - Schema change: also document it in the README section about recreating the volume.
2. Dataset scoping (no query changes)
   - `src/fraudradar/datasets.py`: `resolve_dataset(conn, slug) -> Dataset` (404-able error when unknown) and `use_dataset(conn, dataset)` that runs `SET LOCAL search_path TO <quoted schema>, public`.
   - API: a dependency that reads the `X-Dataset` header (default `saml-d`), resolves it and applies `use_dataset` on the request connection before the route runs; every existing data route uses it. Unknown slug → 404 with a Portuguese message. New routes: `GET /datasets` (list: slug, name, origin, active_model_version, created_at) and `POST /datasets` (create an empty dataset; body {name, slug}; audit_log entry) — authenticated like the others.
   - Worker: global `--dataset <slug>` option (default `saml-d`) applied to load/batch/backfill/replay; the model used for scoring comes from `datasets.active_model_version` when set (look for `models/<slug>/<version>.txt` + card), otherwise the current official model (keep today's behavior for saml-d byte-for-byte).
3. Background jobs
   - `python -m worker serve`: loop that atomically claims the oldest queued job (`SELECT ... FOR UPDATE SKIP LOCKED`), marks running, dispatches by kind to a handler registry, records progress/message, marks done/failed (with the Portuguese error message, no stack traces to the user), and sleeps a few seconds when idle; graceful stop on SIGINT/SIGTERM. Implement only the `process` kind now (= run the existing replay/backfill for the job's dataset); `import` and `train` handlers must exist and fail with a clear "ainda não implementado" so later phases plug in.
   - API: `GET /jobs/{id}` and `GET /jobs?dataset=` (latest 20) returning status, progress, message and dates; no endpoint creates jobs yet except a `POST /datasets/{slug}/process` that enqueues `process`.
   - infra/docker-compose.yml: a `worker-serve` service (same image as `worker`, command `serve`, depends on db healthy, restart unless-stopped) that `docker compose up` starts by default; keep the existing one-shot `worker` profile working. Terraform: only document in infra/terraform/README.md that the job runner is not in Terraform yet (do not change .tf files).
4. Front
   - App context gets the current dataset (default `saml-d`, persisted in localStorage with try/catch) and the list from `GET /datasets`; `web/src/lib/api.ts` sends `X-Dataset` on every request; switching dataset resets the week and reloads data.
   - A compact dataset selector in the top bar, left of the breadcrumb separator, only shown when there is more than one dataset (so today nothing changes visually). Follow web/DESIGN.md.
   - Mocks: support two datasets so NEXT_PUBLIC_USE_MOCKS=true can exercise the selector.
5. Tests
   - tests/api: dataset scoping (a second dataset created in the test DB is isolated: alerts in one do not show in the other), unknown slug 404, GET/POST /datasets, jobs endpoints. tests/worker: serve claims one job at a time, failure path, process job runs on the right schema. tests for slug/schema validation (injection attempts rejected). Web tests for the X-Dataset header and the selector logic.
   - Update docs/glossary.md (dataset → conjunto de dados, job → trabalho), web/API_CONTRACTS.md, README route table and api/AGENTS.md if it lists dependencies.

## Verification (report exact summaries)
- uv run ruff check . && uv run ruff format --check .
- TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_codex_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest   (0 skipped expected; the compose Postgres runs on 5432)
- cd web && pnpm lint && pnpm test && pnpm build

Final report in Portuguese: files changed, the decisions you had to take, test results, what was not verified. Only claim what is actually in the diff.
````
