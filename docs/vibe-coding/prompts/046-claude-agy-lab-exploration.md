---
id: 046
area: ml
autor: Claude Code (conta 1)
destino: agy (Antigravity CLI, gemini-4-argon-high)
pai: 045
data: 2026-11-05
---

# Explore SAML-D and benchmark AML models in the lab

You are working in `C:\codigo\pessoal\fraudradar`. Work autonomously until the task is
done; nobody will answer questions while you run. Write all prose (report, chart titles,
comments) in Brazilian Portuguese; code identifiers in English.

## Context

FraudRadar PLD is a bootcamp project: weekly anti-money-laundering monitoring over the
synthetic SAML-D dataset (`data/SAML-D.csv`, ~1 GB, ~9.5 M transactions, 12 columns).
Read first: `.agents/skills/fraudradar/SKILL.md` (repository rules), `lab/README.md`,
`README.md` (what the system does) and `db/init/002_tables.sql` (what the model must
eventually produce: a weekly **queue of alerts per account**, with a score, a predicted
typology, feature contributions and the countries involved).

The product design: once a week, the batch scores the week's activity and produces a
queue of **accounts** ranked by suspicion for a human analyst. So the unit that matters
in the end is the **account-week**, not the single transaction. Analysts have a limited
capacity per week, so what matters is how many laundering accounts land at the top of
the queue (recall at a fixed queue size), not accuracy.

A teammate (Victor) already experimented. Read his notebooks before starting, so you
build on them instead of repeating them: `lab/pedro/reference/victor_lightgbm.ipynb`
(LightGBM) and `lab/pedro/reference/victor_lstm.ipynb` (LSTM and GRU). Summarize what he
did, what he measured and any methodological problems you spot (leakage, random split,
wrong unit), in the report.

## Where you work — hard boundary

- Everything you create goes under `lab/pedro/`. That folder is git-ignored on purpose.
- Do **not** create, edit or delete anything outside `lab/pedro/`. Not `src/`, not
  `notebooks/`, not `tests/`, not `pyproject.toml`, not `uv.lock`, not `.gitignore`.
  Do not run `uv add`, `pip install` or any git command that changes state.
- The environment is ready: `uv run python ...` from the repository root has pandas,
  pyarrow, scikit-learn, lightgbm, matplotlib, seaborn, networkx and jupyter. If you
  really need another package, don't install it; note in the report what it would add.
- Prefer numbered Python scripts (`lab/pedro/01_load.py`, `02_eda.py`, ...) run with
  `uv run python lab/pedro/NN_x.py`, so each step is reproducible. Import shared
  constants from the project (`from fraudradar.data.schema import CSV_DTYPES`,
  `from fraudradar.config import ROOT_DIR`); never import from `lab/` into anything else.

## Data rules (non-negotiable)

- Read the CSV **once**, with `CSV_DTYPES`, and save a compact parquet under
  `lab/pedro/data/`. Every later step reads the parquet. Never print or dump whole
  frames; inspect with `head`, `describe`, `value_counts`, samples.
- `Amount` is in pounds whatever `Payment_currency` says. Never convert by currency.
- `Is_laundering` and `Laundering_type` are **labels**. You may use them freely to
  analyse and to evaluate. They, and anything derived from them, must **never** be a
  model input. Normal typologies (`Normal_*`) leak the label too. Before training each
  model, assert in code that no feature name contains `laundering`, `typology` or
  `label`, and list the final feature set in the report.
- Split **by time**: train on the earliest weeks, validate on the next ones, test on the
  last ones (for example 70/15/15 of the weeks, never shuffling across time). Features of
  a week may only use data up to the end of that week (no future data). Tune only on the
  validation weeks; report the test weeks once.
- Machine: 32 GB RAM, 16 cores. Keep any single training run under ~15 minutes; if the
  full data is too slow, subsample the **negative** account-weeks in training only (never
  in validation/test) and say so.

## What to do

1. **Load and profile.** Parquet with an `occurred_at` timestamp and a `week` column
   (Monday). Basic numbers: rows, accounts, weeks, date range, laundering rate per
   transaction and per account-week.
2. **Exploratory analysis with charts** (PNG, `lab/pedro/figures/`, titles and axes in
   PT-BR). At least: laundering rate over time; distribution of `Amount` (log scale) for
   normal vs laundering; laundering rate by `Payment_type`, by sender and receiver
   country and by currency pair; transactions per typology (the 28 typologies, normal
   and suspicious); hour-of-day and day-of-week patterns; account degree (fan-in/fan-out)
   for laundering vs normal accounts. Add any other chart that reveals something useful.
   Each chart gets one or two sentences of reading in the report.
3. **Account-week dataset.** One row per (account, week) with activity. The label is 1 if
   the account sent or received any laundering transaction that week. Features, all
   computed only from transactions (never labels), for example: counts and sums sent and
   received, distinct counterparties in and out, share of cash and cross-border, share of
   amounts just below round thresholds, number of countries and currencies, ratio of this
   week to the account's own history (previous weeks only), night-time share, time
   between transactions, and simple graph signals (degree, counterparties' degree).
4. **Models.** On the same split and features, compare at least:
   - a transparent rule baseline (a few hand rules like the ones listed in
     `db/rules/README.md`, scoring accounts by how many rules fire);
   - logistic regression (scaled features);
   - LightGBM (the project's main model) with class imbalance handled;
   - one unsupervised option (Isolation Forest) as a reference;
   - optionally one more you think is worth it, if time allows.
   Metrics on the test weeks, per model: PR-AUC, ROC-AUC, and recall of laundering
   accounts in the top 100, 500 and 1000 accounts **per week** (averaged over test
   weeks), plus precision at those cut-offs. Also recall per laundering typology for
   the best model. Chart: precision-recall curves of all models on one figure.
5. **Typology.** For the accounts flagged by the best model, try to predict the
   laundering typology (multiclass over the suspicious typologies only, trained on the
   true positive account-weeks of the training weeks). Report macro-F1 and a confusion
   matrix chart. This is a feasibility check, keep it simple.
6. **Explainability check.** For the LightGBM model, a global feature-importance chart
   (gain) and, if `lightgbm`'s `pred_contrib=True` works, the contributions for 3
   example flagged accounts. This is what the alert screen will show.

## Deliverable: `lab/pedro/REPORT.md`

In Brazilian Portuguese, plain words, for the team (5 students). Sections:
1. Como rodar (the exact commands, in order, and how long each took).
2. O dataset em números.
3. O que os gráficos mostram (each figure linked with a relative path and 1–2 sentences).
4. O que o Victor já tinha feito, e o que muda com este trabalho.
5. Features usadas (final list) and the anti-leakage check.
6. Comparação dos modelos (one table with all the metrics above, test weeks only).
7. Tipologia e explicabilidade.
8. Recomendação: which model and features you would take to `src/fraudradar` and why,
   which queue size makes sense, and the open risks. Do **not** move anything into
   `src/fraudradar` yourself.
9. Limitações: what you did not do, what you cut for time, anything you are unsure of.

Be honest about the numbers: if a model looks too good (for example PR-AUC above 0.95),
suspect leakage first, look for it, and report what you checked. If something fails or
takes too long, cut scope, say so in the report and still deliver the report.

## Final message

Reply with: the list of files you created, the model comparison table, the top 3
findings, and anything you could not do.
