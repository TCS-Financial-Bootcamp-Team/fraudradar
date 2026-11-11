---
id: 104
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code do Vinicius (delegado pelo Pedro)
pai: 103
data: 2026-11-11
---

# Delegação: defeitos achados no teste de ponta a ponta dos bancos externos

Contexto: o Claude do Pedro migrou o banco local sem apagar dados, remontou o Docker e testou na
API real o fluxo novo (contas suspeitas, simulação processada sozinha pelo `worker serve`, banco
externo de teste com relatório de compatibilidade e importação como conjunto novo, recusa do
retreino com pouco gabarito). Achou cinco defeitos; o da imagem Docker sem o DDL já foi corrigido
(commit `fix(infra)`). Os quatro restantes iam para o Sonnet da conta 2 do Pedro, que bateu o limite
de 5 h antes de começar; o Pedro decidiu delegar ao Claude do Vinicius. O prompt abaixo é
autocontido para rodar em outra máquina.

Prompt entregue ao Pedro, na íntegra:

````text
You are working in the FraudRadar PLD repository (TCS-Financial-Bootcamp-Team/fraudradar). Pedro asked you to finish four defects on his feature branch. You run with full context of this repo but none of Pedro's local machine: everything you need is in the branch.

## Setup

1. `git fetch origin && git switch feat/external-datasets && git pull` (do not work on main). Do not rebase or force-push: other people use this branch.
2. Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md (commits, branches and the mandatory prompt registry), api/AGENTS.md, docs/external-data.md (the approved design of this feature), docs/model.md.
3. `uv sync --all-groups`. Tests need the Compose Postgres: `docker compose up -d db`. If your local volume is older than this branch, the new tables are missing: either `docker compose down -v && docker compose up -d db` (destroys your local data) or apply, in one transaction, the change of `ingestions.source` in db/init/002_tables.sql plus db/init/003_platform.sql, 004_processing.sql and 005_connections.sql. Tests only touch a database whose name ends in `_test`.

## What this branch already does (do not redo)

Datasets isolated per Postgres schema (`X-Dataset` header in the API, `--dataset` in the worker, registry in public.datasets); background jobs in public.jobs executed by `python -m worker serve` (Compose service `worker-serve`), with a scheduler that processes each dataset every `processing_settings.interval_minutes` (default 60); continuous processing that recomputes only the open week and freezes closed weeks; "Contas suspeitas" as the home screen; a transaction simulator (`POST /datasets/{slug}/simulate`); external Postgres connections with encrypted password, host allowlist, compatibility report and import as extension or new dataset; retraining per dataset only with ground truth, and promotion of a version. 530 Python tests and 61 web tests pass.

## Fix exactly these four defects (with tests), nothing else

1. The simulator is unrealistic. In Docker, 500 simulated transactions produced 263 alerts for 890 active accounts in the simulated week (30% of the accounts; the real rate is ~0.3%). Cause: src/fraudradar/data/simulation.py draws random sender/receiver pairs among existing accounts, so almost every simulated transaction is a "first transaction between the two accounts" with a new counterparty — the strongest features of the model. Make normal simulated traffic resample REAL edges: pick existing (sender, receiver) pairs with their payment type, currencies and locations from the dataset's recent history (weighted by frequency), with amounts drawn around each pair's own history, dated after the dataset's last date. Only the optional injected fan-out pattern may create new pairs. Keep `ingestions.source = 'simulation'` and never write ground truth. Tests: on a small synthetic dataset with a fixed set of pairs, normal simulated traffic reuses only existing pairs (the fan-out excepted), and without the injected pattern the share of new counterparties is ~0.
2. The in-sample guard is applied to the wrong datasets. A new external dataset (separate schema) whose dates are before the official model's `train_end` (2023-05-21, in models/lightgbm_v1.json) is never processed: the process job ends with "nada novo: não há período posterior ao treino do modelo". That guard only makes sense for the dataset the active model was trained on. Rule: refuse weeks up to the card's `train_end` only when the dataset being processed is the one the active model was trained on. Record the training dataset slug in the card when training (src/fraudradar/model, the per-dataset retraining path too) and treat cards without it as `saml-d` (the official model). For any other dataset, process every week. Tests for both cases (same dataset → refused; other dataset with old dates → processed).
3. The compatibility suggestion (src/fraudradar/sources/compatibility.py, `suggest`): when ~100% of the sample accounts already exist AND the dates overlap the current dataset, the data is most likely a copy of what is already loaded. Say so explicitly in the Portuguese message (for example: "parece ser a mesma base já carregada: importar duplicaria transações"), still as a suggestion, never deciding for the analyst. Test.
4. Existing databases have no way to fill `public.datasets.labeled_weeks` and `has_laundering` (today they are computed only after `load`, after an import with ground truth and after `train`; on Pedro's machine it had to be done by hand). Add `python -m worker labels [--dataset slug]` (default: every dataset) that recomputes and stores them using worker/labels.py, document it in README.md (in the section about updating/recreating the database) and test it.

## Rules

- Code identifiers in English; comments, docs, logs and on-screen/API messages in Brazilian Portuguese.
- Features and score only in src/fraudradar. The model never reads ground_truth / Is_laundering / Laundering_type to score; the API never reads ground_truth (worker/labels.py and worker/metrics.py are the allowed readers).
- Never print or commit secrets (.env, keys). Never touch data/SAML-D.csv in full (use head/nrows).

## Verification (report the exact numbers; 0 skipped)

- `uv run ruff check . && uv run ruff format --check .`
- `TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_vinicius_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest`
- `cd web && pnpm install && pnpm lint && pnpm test && pnpm build` (only to make sure nothing broke; you should not need to change the front).

## Delivery

- Commit on feat/external-datasets following CONTRIBUTING.md (one scope per commit, message in Portuguese, imperative, lowercase, ≤72 chars, footer `Prompt: 105` and your Co-Authored-By line), then `git push`. Do not open a PR and do not merge: Pedro opens it.
- Register your result in docs/vibe-coding/prompts/105-<your-name>-e2e-fixes-result.md (front matter: id 105, area backend, autor = you, destino Pedro, pai 104, data, tipo resposta), with what changed, how it was verified (commands and numbers) and what is still open, in Portuguese. Commit it in a `docs:` commit.
- Final report to Pedro, in Portuguese: commits, test results, anything not verified, any decision you had to take.
````
