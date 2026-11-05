---
id: 061
area: backend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code de outro membro do grupo
pai: 060
data: 2026-11-05
---

# Build the FraudRadar weekly worker (load, score, queue, evidence, metrics, replay)

You are working in the FraudRadar repository (GitHub: `TCS-Financial-Bootcamp-Team/fraudradar`).
Work autonomously until the task is done and every gate below is green. Nobody will answer
questions while you run: when something is ambiguous, pick the option this brief points to,
write down why, and keep going. Code in English; everything a person reads (comments,
docstrings, log and CLI messages, test descriptions, commit messages, docs) in Brazilian
Portuguese.

## 0. Read first, in this order

1. `.agents/skills/fraudradar/SKILL.md` — team rules: language, commits, branches, the
   prompt log you must keep, `lab/`. Follow it exactly.
2. `.agents/skills/fraudradar-overview/SKILL.md` — the whole project: flow, tables, routes,
   screens, folders.
3. `AGENTS.md` and `api/AGENTS.md` — non-negotiable rules and the backend patterns (SQL with
   SQLAlchemy Core `text()`, COPY through the psycopg connection, tests against a real
   Postgres, `REQUIRE_TEST_DB=1`).
4. `docs/model.md` — the official LightGBM model: what it does, its numbers, its limits.
5. `db/init/002_tables.sql` — the schema. The comments define the JSON formats you write.
6. Code you will call: `src/fraudradar/data/saml_d.py`, `src/fraudradar/features/history.py`,
   `src/fraudradar/model/` (`training.py`, `evaluation.py`, `segments.py`, `__init__.py`).
7. Code that reads what you write: `api/repositories/alert_queue.py`,
   `api/repositories/monitoring.py`, `api/routes/monitoring.py`, `api/repositories/weeks.py`,
   `api/domain.py`.
8. The current skeleton: `worker/cli.py`, `worker/Dockerfile`, the `worker` service in
   `infra/docker-compose.yml`.

## 1. Why

The API and the front end are finished, and the official model is on `main` (PR #7). But
nothing writes `transaction_scores`, `alerts`, `evidence`, `accounts.segment` or
`weekly_batches`, so with a real database the alert queue is empty and the front end only
works with `NEXT_PUBLIC_USE_MOCKS=true`. The worker is the missing piece: it turns the
transactions in Postgres into the weekly alert queue the analyst works on.

## 2. Branch and starting point

- Start from an up-to-date `main`: `git switch main && git pull`.
- PR #8 (`fix/model-card-utf8`) fixes how the model card is written and read (UTF-8). If it
  is not merged yet, run `git merge origin/fix/model-card-utf8` into your branch first:
  without it, a card trained on Windows cannot be read inside the Docker worker.
- Your branch: `feat/worker-batch`.
- Train the model once before you start (`uv sync --all-groups`, then
  `uv run --group ml python -m fraudradar.model train`, about 5 minutes; it needs
  `data/SAML-D.csv`). The card lands in `models/lightgbm_vN.json`.
- **Memory:** the full SAML-D (9.5 M rows) plus the model uses several GB. Never run the
  training, a full backfill and the full test suite at the same time: a machine froze doing
  exactly that. Run heavy jobs one at a time.

## 3. Rules that are not up for interpretation

- Features and scores come **only** from `src/fraudradar` (`compute_features`, the booster).
  Do not reimplement any feature in `worker/`.
- The model path never reads `ground_truth`. Ground truth is read in one place only: the
  function that computes `weekly_batches.metrics`, after the alerts of the week are written.
  A test must prove that changing `ground_truth` does not change any score or alert.
- The worker reads transactions from **Postgres**, not from the CSV. The CSV is read only by
  `worker load`.
- Feature history must start where the model's history started: read transactions from
  `card["history_start"]` up to the end of the latest week being processed. The counts in
  the features depend on it (see the notes in the card).
- Categorical features must use exactly the categories in `card["categories"]`, in that
  order (for example `pd.Categorical(values, categories=card["categories"]["payment_type"])`);
  an unknown value becomes NaN, never a new category.
- The CAIXA (`features.history.CASH_ACCOUNT`, `-1`, the other side of every cash deposit and
  withdrawal) never becomes an alert, never counts as an active account and never gets a row
  in `accounts`. Group accounts with the ids after `with_cash_account`, exactly like
  `evaluation.account_weeks`.
- Do not change `db/init/002_tables.sql` unless you truly cannot do the task without it. If
  you must, follow the schema-change rule (`!` in the commit and the
  `docker compose down -v` warning) and explain why in the PR.
- Do not touch `web/`, `src/fraudradar/ai/`, `rag/` or `db/rules/*.sql` content (those belong
  to other fronts). Do not change the model or its features.

## 4. Decisions already made (follow them; they are reversible, but not yours to reopen)

1. **`model_versions.threshold` = `card["queue_cut"]`** (the account-week cut that decides
   who enters the queue). The transaction threshold stays in `metrics` as
   `transaction_threshold`.
2. **Out-of-sample by default.** The worker processes only weeks that start after
   `card["train_end"]` (the test period, 22/05/2023 to 23/08/2023 with v1). A week inside the
   training period is refused unless the caller passes `--allow-in-sample`, and the CLI says
   why: those scores were seen in training and would make the demo look better than it is.
3. **Typology stays empty.** The model does not predict typology; it will come from the LLM
   assessment (front 3). Write `alerts.typology = NULL` (the API shows "Indefinida") and leave
   `typology_accuracy` out of `metrics` (the API shows 0 for a missing key).
4. **Transaction ids follow the CSV.** `worker load` writes `transactions.id = CSV row
   position + 1` (the `id` from `load_csv` plus 1) and `ground_truth.transaction_id` with the
   same value. COPY writes explicit values into a `GENERATED ALWAYS` identity column (it
   behaves like `OVERRIDING SYSTEM VALUE`); after the load, move the identity sequence past
   the max id (`SELECT setval(pg_get_serial_sequence('transactions', 'id'), max(id)) FROM
   transactions`), otherwise the API's `POST /ingestion/*` collides.
5. **Re-running a week.** If `weekly_batches` already has the week, `batch` does nothing and
   says so. `--force` reprocesses it, but is refused when the week was already released
   (`released_at IS NOT NULL`) or any of its alerts has a row in `decisions`: analysts'
   work is never deleted. Reprocessing deletes and rewrites that week's alerts (evidence
   cascades), its `transaction_scores` for that model version and its `weekly_batches` row,
   all in one transaction.
6. **Audit.** Each processed week writes one `audit_log` row: `actor = 'worker'`,
   `action = 'batch'`, `entity = 'week'`, `entity_id = <week ISO date>`, `details` =
   `{"alerts": n, "model_version": "...", "active_accounts": n}`. Add `lote` → `batch` to the
   `audit_log.action` row of `docs/glossary.md`.
7. **CI runs the ML tests.** Add `--group ml` to the `uv sync` of the `python` job in
   `.github/workflows/ci.yml`, in its own `ci:` commit, so the model and worker tests stop
   being skipped on GitHub. Say in the PR that front 5 can drop that commit if the CI time
   matters more.

## 5. The CLI (`python -m worker ...`)

Keep `worker/cli.py` as a thin layer (argument parsing, logging, exit codes). Put the logic
in modules under `worker/` (for example `worker/load.py`, `worker/batch.py`,
`worker/metrics.py`, `worker/repository.py`) that receive an `Engine`/`Connection`, so tests
can call them directly.

| Command | What it does |
|---|---|
| `load [--csv PATH]` | Reads `data/SAML-D.csv` (or `--csv`) with `load_csv` and COPYs `transactions`, `ground_truth` and `accounts` (`first_seen_at`, `last_seen_at`, no segment yet; never the CAIXA). Refuses if `transactions` already has SAML-D rows (`ingestion_id IS NULL`). Logs the counts and the elapsed time. |
| `batch --week YYYY-MM-DD [--force] [--allow-in-sample]` | Processes one week (the date must be a Monday; otherwise exit with a clear message). |
| `backfill [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force] [--allow-in-sample]` | Processes every week in the range, computing features **once** for the whole range. Default range: from the first Monday after `train_end` to the last week with transactions. This is how the demo database is prepared. |
| `replay` | Processes the next week after the latest one in `weekly_batches` (or the first out-of-sample week if there is none). Does **not** release anything: releasing is the API's `POST /replay/next-week`. Says "nada a processar" when there is no next week with transactions. |

Exit code 0 on success and on "nothing to do"; 1 on errors (database down, no model, invalid
week), with a PT-BR message that tells the user what to run.

## 6. What one processed week writes (all in a single transaction per week)

Week = Monday 00:00 to next Monday 00:00 (naive timestamps; use
`features.history.week_start`).

1. **`model_versions`**: upsert the active version, `version = "lightgbm_v{card['version']}"`,
   `features = card["features"]`, `threshold = card["queue_cut"]`, `metrics =
   card["metrics"]` plus `transaction_threshold`, `active = true`, and set `active = false`
   on every other version (there is a unique index on the active one).
2. **`transaction_scores`**: one row per transaction of the week (COPY), score from
   `booster.predict(x[card["features"]])`.
3. **`alerts`**: for each account (CAIXA excluded), its score in the week is the **max** score
   of the transactions it sent or received. Accounts with score `>= card["queue_cut"]`
   enter, at most `card["queue_size"]` per week, highest first. `queue_position` = 1..n by
   score descending, ties broken by account ascending. `status = 'new'`, `typology = NULL`,
   `model_version` = the active version. `total_amount` and `transaction_count`: sum and count
   of the account's transactions in the week, sent and received. `countries`: every country
   appearing in those transactions (`sender_country` and `receiver_country`), ordered by the
   total amount moved through it, highest first, without duplicates (`countries[1]` is what
   the queue shows).
4. **`evidence`** (one row per alert):
   - `contributions`: `{feature: contribution}` for **all** model features, computed with
     `training.explain` (or `booster.predict(..., pred_contrib=True)`) on the account's
     highest-score transaction of the week, in log-odds. The API keeps the top positive ones.
   - `rules`: run every `db/rules/*.sql` file (they take `:week` and return `account, rule,
     detail`) and attach to each alert the rows of its account as
     `[{"code": "R-<NNN from the file name>", "description": rule, "detail": detail}]`.
     The folder is empty today, so this is `[]`; the mechanism must work when front 1 adds
     files (test it with a temporary rule file).
   - `weekly_signals`: the account's week in numbers: `sent_count`, `received_count`,
     `sent_amount`, `received_amount`, `distinct_counterparties`, `cash_share`,
     `cross_border_share`.
   - `graph`: `{}` (the API builds the 2-hop graph from `transactions`).
5. **`accounts`**: upsert `first_seen_at`/`last_seen_at` for accounts seen in the week (new
   ingested accounts appear here), and set `segment` with
   `segments.assign_segments(account_profile(transactions, until=<week start>), card["segments"])`
   for the accounts active in the week.
6. **`weekly_batches`**: `week`, `model_version`, `active_accounts` (distinct non-CAIXA
   accounts with at least one transaction in the week), `metrics` (section 7),
   `released_at = NULL`.
7. **`ingestions`**: for API uploads whose transactions fall in the week, set `processing`;
   when every week touched by an upload is processed, set `completed`.
8. **`audit_log`**: one row (decision 6).

## 7. `weekly_batches.metrics` (the only code that reads `ground_truth`)

Computed after the alerts are written, on the account-weeks of that week, using only
transactions that have a `ground_truth` row (ingested ones have none and are left out of
every denominator). An account-week is "laundering" when any of its transactions has
`label = 1` (same rule as `evaluation.account_weeks`).

- `recall`: laundering account-weeks in the queue / laundering account-weeks.
- `precision`: laundering account-weeks in the queue / account-weeks in the queue.
- `laundering_accounts`, `queue_size`, `innocents_in_queue`: the raw counts behind them.
- `country_rates`: for each country, alerted accounts whose main country (the first of their
  `countries`) is that country / active accounts whose main country is that country. Only
  countries with at least 30 active accounts in the week.
- `payment_type_rates`: for each `payment_type`, alerted accounts with at least one
  transaction of that type / active accounts with at least one transaction of that type.
- Leave `typology_accuracy` out (decision 3).

The API reads `recall`, `typology_accuracy`, `country_rates` and `payment_type_rates` and
ignores the rest; the extra keys are for the team and the presentation.

## 8. Tests (`tests/worker/`, against a real Postgres, `REQUIRE_TEST_DB=1`)

The DB fixtures (`test_db_url`, `db`) live in `tests/api/conftest.py`. Move the ones you need
to `tests/conftest.py` without changing their behaviour, so `tests/api/` and `tests/worker/`
share them; the API suite must stay green. Use `tests/fake_saml_d.py` (`synthetic()`) for
data and train a small model into `tmp_path` with `save_model` (as `tests/test_model.py`
does). Worker tests need the `ml` group: `pytest.importorskip("lightgbm")` at the top.

Each rule needs a test, and every test with more than one branch needs a negative case:

- `load`: ids are row + 1; `ground_truth` lines up; `accounts` has first/last seen and no
  CAIXA; the identity sequence was moved (an insert after the load gets `id > max`); a
  second `load` is refused.
- `batch` on a synthetic week: alerts `<= queue_size`; every alert score `>= queue_cut`;
  positions are exactly 1..n; no account `-1`; `countries` ordered by amount;
  `total_amount`/`transaction_count` equal a SQL sum over `transactions`; `contributions` keys
  equal `card["features"]`; one `transaction_scores` row per transaction of the week; the
  `weekly_batches` row and the `audit_log` row exist.
- **No leakage:** run `batch`, record scores and alerts; then flip every `ground_truth.label`
  and reprocess with `--force`: scores and alerts must be identical; only `metrics` changes.
- **Same scores as the model:** for the synthetic data, the worker's scores equal
  `booster.predict` on `compute_features` of the full synthetic set, for every transaction of
  the processed week (this catches a wrong history start or wrong categories).
- Idempotency: second `batch` is a no-op; `--force` refused after a decision and after
  release; `--force` without them gives the same alerts.
- In-sample week refused without `--allow-in-sample`.
- `replay` processes the next week and then says there is nothing to do.
- Rules mechanism with a temporary `.sql` file.
- `ingestions` status moves to `completed` when its weeks are processed.
- **Through the API** (use the `client` fixture): after `batch`, `GET /alerts?week=` returns
  the alerts in order with `queue_position`; `GET /alerts/{id}` has non-empty
  `contributions`; after `POST /replay/next-week`, `GET /monitoring?week=` returns the
  `recall` you wrote.

## 9. Acceptance on the real data

1. `docker compose up -d db`, then (from the host, with `.env` pointing to it)
   `uv run python -m worker load` and `uv run python -m worker backfill`. Report the time and
   peak memory of each.
2. **The worker must reproduce the model's own numbers.** Aggregated over all processed
   test weeks, queue recall and precision must match `card["metrics"]["queue_with_cut"]`
   (v1: recall 95.1%, precision 99.0%, 2.2 innocents per week) within 0.1 percentage point.
   If they do not match, the worker's account-week logic differs from
   `evaluation.queue_with_cut`: find out why and fix it, do not adjust the target.
3. Run it in Docker too: `docker compose run --rm worker backfill` (the image already has
   `ml`; `models/` and `data/` are mounted).
4. End to end with the real API and front end: `NEXT_PUBLIC_USE_MOCKS=false`,
   `docker compose up -d --build db api web`, log in, release a week, open the queue, an
   alert's detail and the monitoring page. Take screenshots for the result log.

## 10. Gates (all green before the PR)

```bash
uv lock --check
uv run ruff check . && uv run ruff format --check .
REQUIRE_TEST_DB=1 TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_<yourname>_test \
  uv run --group api --group ml pytest
cd web && pnpm lint && pnpm test && pnpm build   # nothing in web/ should change, but prove it
```

Report the exact counts (passed / skipped). Zero skipped with `REQUIRE_TEST_DB=1` and the `ml`
group; if anything is skipped, say which and why.

## 11. Commits, PR and the prompt log

- Conventional commits in Portuguese, one scope per commit (see `CONTRIBUTING.md`), each
  ending with `Prompt: <NNN>` and your `Co-Authored-By`. Expected shape: `feat(worker): ...`
  (one or more), `test(worker): ...` if separate, `ci: ...` (decision 7), `docs: ...`.
- Update the docs: the worker section of `README.md` (commands and the demo preparation:
  `load`, `backfill`, then release weeks in the app) and the "Estado" section of
  `.agents/skills/fraudradar-overview/SKILL.md` (copy it to `.claude/skills/`; the skills
  test checks they match).
- Prompt log in `docs/vibe-coding/prompts/`: the prompt your human gave you, any delegation
  you make, and a result file with branch, commits, how it was verified (commands and
  numbers, the real-data comparison of section 9), what the team must do after the merge and
  what is still open. Numbers 060 and 061 are taken (061 is this brief); check `main` and the
  open branches for the next free number.
- Push `feat/worker-batch` and open a PR to `main`. **Do not merge it**: the team reviews it.

## 12. Out of scope (write them in the PR as open points, do not do them)

- Typology prediction and the LLM assessment (front 3).
- The content of `db/rules/` (front 1).
- Front-end changes. Known wording issue to report, not fix: the monitoring card "Taxa de
  alerta" says "Proporção de transações que geraram alertas", but the API computes alerts /
  active **accounts**; and its footer says the metrics are computed "pela API", while the
  worker computes them.
- Score calibration.

## 13. Final message

Reply with: the branch and PR link, the list of commits, the gate outputs (counts), the
real-data comparison against the model card, load/backfill time and memory, anything you
decided differently from this brief (with the reason) and the open points.
