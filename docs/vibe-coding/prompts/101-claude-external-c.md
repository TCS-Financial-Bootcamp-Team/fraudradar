---
id: 101
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code (conta 2 do Pedro, Sonnet)
pai: 098
data: 2026-11-11
---

# Delegação ao Sonnet: retreino por conjunto de dados e promoção do modelo

Prompt enviado, na íntegra:

````text
You are one of THREE agents working IN PARALLEL in separate git worktrees of the FraudRadar PLD repository. Yours is C:/codigo/pessoal/fr-wt-c on branch feat/external-c. You are running non-interactively: do not ask questions; print a final report in Portuguese at the end.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/DESIGN.md, web/API_CONTRACTS.md, docs/glossary.md, and above all docs/external-data.md — the design approved by the product owner; implement YOUR section of it exactly. Phase A (datasets per Postgres schema with X-Dataset / --dataset, public.jobs and `worker serve`) is already in your branch: read src/fraudradar/datasets.py, worker/jobs.py, api/dependencies.py and db/init/003_platform.sql before starting.

Ownership: stay inside "You own"; you may READ anything. If something outside must change, do not change it: list it under "Needs from other agents" in the report. The other two agents own: B1 = continuous processing, suspicious accounts, simulator, scheduler (worker/batch.py, worker/jobs.py except your one registration, db/init/002 and 004, accounts/processing/weeks routes and UI, sidebar, dashboard, settings); B2 = external connections/compatibility/import (src/fraudradar/sources, db/init/005, ingestion routes and UI, config.py).

Rules: code identifiers in English; comments, docs, logs and on-screen text in Brazilian Portuguese. Features and scoring live only in src/fraudradar. The model never reads ground_truth / Is_laundering / Laundering_type for scoring. Never print secrets. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never run `docker compose down -v` or touch the real database: tests use only databases ending in `_test`.

Setup (once): `uv sync --all-groups` in C:/codigo/pessoal/fr-wt-c; `cd C:/codigo/pessoal/fr-wt-c/web && pnpm install` (web/.env.local is already there).

Verification (report exact summaries; 0 skipped expected):
- uv run ruff check . && uv run ruff format --check .
- TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_c_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest
- cd web && pnpm lint && pnpm test && pnpm build

Final report (Portuguese): files changed, decisions you had to take, test results, what was not verified, "Needs from other agents". Only claim what is actually in the diff.

## Your part (C): retraining per dataset and model promotion

docs/external-data.md section "Retreino" and "Conjuntos de dados" (models per dataset).

You own: src/fraudradar/model/** (only what is needed to train from a dataset's Postgres tables and save versions under models/<slug>/ — keep `python -m fraudradar.model train` from the CSV working exactly as today for the official model), new worker/train_job.py with the `train` handler (register it in worker/jobs.py DEFAULT_HANDLERS — touch only that line), new api routes/repositories/schemas for models (GET /datasets/{slug}/models: versions with metrics and which is active; POST /datasets/{slug}/train: enqueue `train`, refused with a Portuguese reason when the dataset has no ground truth or too few labeled weeks; POST /datasets/{slug}/models/{version}/promote: sets datasets.active_model_version, audit_log entry), api/main.py (add your router — one line), front web/src/features/models/** (new) and web/src/features/alerts/components/monitoring.tsx (add a "Modelo" section: active version and its metrics, versions list side by side with the active one, "Treinar nova versão" with the reason when disabled, job progress via GET /jobs/{id}, "Promover" with a confirmation that explains closed periods do not change), tests, docs/model.md (a short section on per-dataset retraining).

Key requirements:
- Training reuses the official configuration and time split of src/fraudradar/model (never a random split); reads transactions + ground_truth of the dataset's schema (use fraudradar.datasets.use_dataset); ground truth is used only to train and evaluate. Writes models/<slug>/lightgbm_vN.txt + card JSON with the same metrics fields as models/lightgbm_v1.json; the saml-d dataset keeps using the official model unless a new version is promoted.
- The worker's scoring must load the dataset's active version (Phase A already resolves `models/<slug>/<version>.txt`; verify and fix only inside src/fraudradar/model if needed).
- Memory: training on the full SAML-D needs ~7 GB; keep the existing memory-safe paths; the train job reports progress at each stage.
- Tests: train on a small synthetic labeled dataset in a test schema produces a version with metrics; refusal without ground truth; promote updates active version and audit; GET models lists versions; scoring after promotion uses the new file. Keep tests fast (tiny data).
````
