---
id: 107
area: geral
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code do Vinicius (delegado pelo Pedro)
pai: 106
data: 2026-11-12
---

# Delegação: retorno dos analistas no retreino e saída do recall das telas

## Prompts do Pedro

> o professor sugeriu, uma funcionalidade em que quando o analista ve o resultado exibido pelo modelo, e identifica um falso positivo, ele pode classificar essa análise como falsa, ou arquivar ela, e dai, esse feedback dele seria usado para retreinar o modelo, me de sua opinião sobre o assunto

> faça o prompt vou mandar pro claude do vinicius, adcione tambem, a remoção da metrica do recall no front, isso é algo que uma plataforma de verdade não teria, não precisa fazer a sua sugestão de reduzir por falta de tempo, faça completo

## Resposta do Claude à primeira pergunta (resumo)

Nota 7/10, precisa de ajuste. Usar a decisão do analista como rótulo é o que os sistemas reais de
PLD fazem, mas do jeito óbvio ("arquivou = inocente, retreina") o modelo piora sem ninguém ver:
arquivar não é o mesmo que "não é lavagem"; o analista só dá retorno sobre o que já está na fila
(o modelo nunca aprende com a lavagem que deixou passar e o recall cai em silêncio); há poucas
decisões; e o analista decide por conta × semana, enquanto o modelo dá nota por transação. A
proposta foi: motivo obrigatório no arquivamento, rótulos numa tabela própria, retreino com o
retorno como sinal extra e trava de promoção, amostra de controle abaixo do corte, painel do
retorno e um analista simulado para medir o efeito de forma honesta.

## Decisões

Do Pedro: a versão completa (sem a alternativa reduzida de só reordenar a fila); o recall sai das
telas, porque uma plataforma de verdade não tem gabarito para medi-lo.

Do Claude (técnicas, reversíveis):

- Continua valendo a decisão 5 do Pedro (registro 098): retreino só em conjunto com gabarito. O
  retorno é um sinal a mais nesse retreino. Em conjunto sem gabarito, o sistema guarda os rótulos e
  mostra o painel, e o botão de retreino explica por que não treina.
- "Recall nas telas" = as métricas medidas contra o gabarito nas telas de operação (visão geral,
  monitoramento, fila, contas): recall da fila, a série do recall e o acerto da tipologia. A
  comparação de versões em Configurações > Modelo continua mostrando as métricas de validação no
  período de teste rotulado, renomeadas como validação, porque é com elas que se decide a promoção
  (bancos fazem isso na validação de modelos). No lugar do recall entram as métricas que uma
  plataforma real consegue medir: precisão confirmada pelos analistas e o que a amostra de controle
  achou fora da fila.
- A trava de promoção vale para toda versão nova (com retorno ou sem): a versão nova não pode achar
  menos lavadoras na fila que a ativa, no mesmo período de teste, além de 1 p.p.

Prompt entregue ao Pedro, na íntegra:

````text
You are working in the FraudRadar PLD repository (TCS-Financial-Bootcamp-Team/fraudradar). Pedro asked you to implement a full feature: the analyst's decisions become feedback labels that can be used to retrain the model, plus removing ground-truth metrics (recall) from the operational screens. You have no access to Pedro's machine: everything you need is in the repo and in this prompt. Work autonomously; when something is not specified, pick the simplest option consistent with the design below and list it under "decisions I took" in your report.

## Setup

1. `git fetch origin && git switch -c feat/analyst-feedback origin/feat/external-datasets` (PR #16 with that branch is still open; build on it, never on main). Do not rebase or force-push.
2. Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md (commits and the mandatory prompt registry), .agents/skills/fraudradar-overview/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/DESIGN.md, docs/external-data.md, docs/model.md, docs/glossary.md.
3. `uv sync --all-groups`; `docker compose up -d db`. If your volume is older than feat/external-datasets, recreate it (`docker compose down -v`, destroys local data) or apply the 002 change of `ingestions.source` plus db/init/003, 004 and 005 in one transaction. Tests only touch a database whose name ends in `_test`.

## Why (read before designing anything)

The professor suggested that when the analyst marks an alert as a false positive, that feedback should retrain the model. Done naively ("archived = innocent, retrain") the model gets worse silently:
- "archive" is not "not laundering": analysts archive for lack of evidence or time;
- selection bias / feedback loop: analysts only see what the model already put in the queue, so the model never learns from the laundering it missed, and retraining on that pushes recall down;
- few labels (a handful of decisions vs millions of transactions);
- unit mismatch: the model scores transactions, the analyst decides per account × week.
Every rule below exists to neutralize one of these. Keep that reasoning in the docs you write.

Also, Pedro decided the recall metric must leave the screens: a real platform has no ground truth to measure it. Real platforms measure what analysts confirm. Pedro also decided earlier (docs/external-data.md, decision 5) that retraining happens only on datasets with ground truth; that stays: feedback is an additional training signal on those datasets. On datasets without ground truth the system still stores feedback and shows the panel, and the retrain button explains why it cannot train.

## Design

### 1. Decision reason

- `decisions` (db/init/002_tables.sql) gets `archive_reason TEXT` with `CHECK (archive_reason IS NULL OR (decision = 'archive' AND archive_reason IN ('false_positive', 'insufficient_evidence')))`. NULL is allowed only for legacy rows: the API requires it for every new `archive` and rejects it (422) for `escalate`/`report`.
- Labels: `archive` + `false_positive` → label 0; `report` → label 1; `archive` + `insufficient_evidence` and `escalate` → no label. The latest decision of the alert wins (a later decision updates or removes the label).
- Front (web/src/features/alerts/components/alert-detail.tsx and its zod schema): when "Arquivar" is chosen, a required choice "Motivo do arquivamento": "Falso positivo confirmado" / "Sem evidência suficiente", with a short hint that only a confirmed false positive teaches the model.

### 2. Label table (never mixed with ground_truth)

- New table `analyst_labels` in db/init/002_tables.sql (so every dataset schema gets it): `alert_id` (PK, FK alerts ON DELETE CASCADE), `decision_id` (FK decisions), `account`, `week`, `label SMALLINT CHECK (label IN (0, 1))`, `origin TEXT CHECK (origin IN ('model', 'exploration'))` (copied from the alert), `source TEXT CHECK (source IN ('analyst', 'simulated'))`, `created_at`, `updated_at`.
- Written in the same transaction as the decision (api/repositories/decisions.py), following the rules of section 1.
- The API reads and writes `analyst_labels`; it still never reads `ground_truth`.

### 3. Exploration sample (below-the-line testing, the fix for selection bias)

- `alerts` gets `origin TEXT NOT NULL DEFAULT 'model' CHECK (origin IN ('model', 'exploration'))`.
- `public.processing_settings` (db/init/004_processing.sql) gets `exploration_per_week INTEGER NOT NULL DEFAULT 5 CHECK (exploration_per_week BETWEEN 0 AND 50)`; 0 turns it off. Editable in the processing settings screen (web/src/features/processing/components/processing-settings.tsx) as "Amostra de controle por semana", with a one-line explanation.
- When the worker builds a week (worker/batch.py), after selecting the queue it draws `exploration_per_week` accounts uniformly at random among the week's active accounts that are NOT in the queue, with a seed derived from (dataset slug, week) so recomputing the open week picks the same accounts. They become alerts with `origin = 'exploration'`, their real max score, queue_position after the model queue, and evidence computed like any alert. The open-week recompute treats them like the other alerts (undecided ones are replaced, decided ones stay).
- Exploration alerts are not suspicious accounts: exclude them from `GET /accounts/suspicious`, from alert counts and alert rate in monitoring, and from the queue set used by worker/metrics.py. In the weekly queue they appear at the end with a discreet badge "Amostra de controle" (tooltip: "Conta sorteada abaixo do corte para medir o que o modelo deixa passar"); the queue gets a filter by origin.

### 4. Retraining with feedback

- `POST /datasets/{slug}/train` accepts `{ use_feedback: bool = false, include_simulated: bool = false }`, stored in the job payload. Same eligibility as today (ground truth required, src/fraudradar/model/eligibility.py); with `use_feedback`, also refuse (Portuguese message) when the closed weeks have fewer than `MIN_FEEDBACK_LABELS = 50` usable labels or no label of either class.
- Only labels from CLOSED weeks are used (the open week can still change). Simulated labels only when `include_simulated`.
- Split: the feedback weeks are after the official train_end (that is where the model has been running), so the official split would put all feedback in the test period. With `use_feedback`, the train job uses a feedback split: `train_end` = Sunday of the last week with usable feedback, capped so at least `MIN_TEST_WEEKS = 4` weeks with ground truth remain after it; validation = the last 4 weeks of training, as today. Feedback after the cut is not used for training (report the count as "reservados para o teste"). Implement it next to `resolve_split` in src/fraudradar/model/training.py.
- Account × week → transactions, done in src/fraudradar/model (features/score rules: only there), e.g. a `read_feedback` next to `read_labeled` in src/fraudradar/model/dataset_data.py:
  - label 0: every transaction of the account in that week (as sender or receiver);
  - label 1: the account's `FEEDBACK_POSITIVE_TOP = 5` transactions of that week with the highest stored model score (transaction_scores), the ones the analyst saw as evidence;
  - never transactions from simulation ingestions (`ingestions.source = 'simulation'`).
- Combining with ground truth: the ground-truth label always wins. A transaction covered by feedback that agrees with ground truth gets `sample_weight = FEEDBACK_WEIGHT = 3.0` in training (confirmed false positives are hard negatives; confirmed positives are cases the model must keep); one that disagrees keeps the ground-truth label with weight 1 and is counted as a conflict. A covered transaction without ground truth (if any) enters training with the feedback label and the feedback weight. Weights apply to the training rows only; validation and test stay unweighted and labeled by ground truth only.
- Constants (`MIN_FEEDBACK_LABELS`, `MIN_TEST_WEEKS`, `FEEDBACK_POSITIVE_TOP`, `FEEDBACK_WEIGHT`, `PROMOTION_RECALL_TOLERANCE = 0.01`) live in src/fraudradar/model/__init__.py with a Portuguese comment each.
- The card gets a `feedback` block: used (bool), include_simulated, labels used by class/source/origin, transactions covered, conflicts with ground truth, labels reserved for the test, and the split actually used.

### 5. Promotion gate (all new versions)

- At the end of training, the worker also scores the ACTIVE model of the dataset on the new version's test period (same features, the active card's feature order, categories, queue_cut and queue_size; reuse what worker/batch.py uses to score from a card) and stores in the card a `comparison` block: active version name, the active model's test metrics on that same period (PR-AUC, queue recall, queue precision, innocents per week) and `gate: { passed, reason }`. Passed = new queue recall on test ≥ active queue recall on test − PROMOTION_RECALL_TOLERANCE. The comparison is apples to apples: both models are out of sample on those weeks.
- `POST /datasets/{slug}/models/{version}/promote` returns 409 with the Portuguese reason when the card's gate failed. Cards without `comparison` (older versions) keep today's behavior.
- The models response (api/schemas/models.py, api/repositories/models.py) exposes the comparison, the gate and the feedback block.

### 6. Simulated analyst (demo and honest measurement)

- `python -m worker simulate-analyst --dataset <slug> [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--error-rate 0.1] [--insufficient-rate 0.2] [--seed N]` decides UNDECIDED alerts (both origins) of closed weeks from ground truth: laundering account-week → `report`; otherwise → `archive/false_positive`; with probability `insufficient-rate` an archive becomes `insufficient_evidence` (no label); with probability `error-rate` the label is flipped (analysts make mistakes). It writes decisions with analyst `analista-simulado` and justification "Decisão simulada a partir do gabarito (demonstração).", updates alert status, writes `analyst_labels` with `source = 'simulated'`, one audit_log entry per run, and creates no COAF report draft. It never touches an alert that already has any decision.
- `python -m worker simulate-analyst --dataset <slug> --undo` removes the simulated decisions and labels and resets to `new` only the alerts whose decisions were all simulated.
- `python -m worker feedback-eval --dataset <slug> [--include-simulated]`: the honest experiment. Trains two models on the SAME feedback split, control (ground truth only) and treatment (ground truth + feedback weights), and saves models/<slug>/feedback-eval-<timestamp>.json with both test metrics (PR-AUC, queue recall, queue precision, innocents per week, recall by typology) and the difference. It does not register versions. This isolates the feedback effect from the effect of training on more recent weeks.
- These commands are worker code allowed to read ground_truth, like worker/labels.py and worker/metrics.py: update the list of allowed readers in api/AGENTS.md and AGENTS.md. Recommended demo range for SAML-D (data ends late August 2023): `--from 2023-05-22 --to 2023-07-16`, leaving the later weeks for the test.

### 7. Feedback panel and the end of recall on screens

- New endpoint (dataset by `X-Dataset`, like the other routes) `GET /feedback/summary?from=&to=`: labels by class, source and origin; confirmed precision = model-origin labels with 1 / model-origin labels; weekly series of confirmed precision; exploration sample: reviewed, positives and "lavagem encontrada fora da fila" rate; labels created after the active model version (`novos desde a versão ativa`); whether the dataset can retrain with feedback and, if not, why. Percentages computed from fewer than 20 cases carry `low_sample: true`.
- Remove from GET /monitoring (api/routes/monitoring.py, api/schemas/monitoring.py, api/repositories/monitoring.py) the fields `recall`, `typology_accuracy` and `recall_series`, and from the web schemas, services, mocks and components: the "Recall da fila" card and `QueueRecallChart` in web/src/features/alerts/components/dashboard.tsx and charts.tsx, and the recall and typology-accuracy indicators in monitoring.tsx. The worker keeps computing weekly metrics into weekly_batches.metrics (dev evaluation); they just are not served to the screens. Do not leave a dead `recall` in any web or API schema except the model validation metrics below.
- Dashboard: the recall card becomes "Precisão confirmada" (share of decided model alerts confirmed as laundering, with the weekly sparkline and the counts behind it; "sem decisões ainda" when empty). Monitoring: new section "Retorno dos analistas" with the panel above and the exploration result.
- Configurações > Modelo (web/src/features/models/components/model-section.tsx): the version table is renamed "Validação no período de teste (dados rotulados)" and shows, for each new version, its metrics side by side with the ACTIVE model measured on the same test period (from `comparison`), the gate result ("Pode ser promovida" / "Bloqueada: acha X p.p. menos lavadoras na fila que a versão ativa"), and the feedback block. Promote is disabled with the reason when the gate failed. "Treinar nova versão" opens a choice: "Incluir o retorno dos analistas (N rótulos: X lavagem confirmada, Y falso positivo confirmado)" and, only when simulated labels exist, "Incluir o retorno simulado"; disabled with the reason when not allowed. A version trained with simulated feedback shows the badge "retorno simulado".
- Follow web/AGENTS.md (component → hook → service → API) and web/DESIGN.md (theme tokens, no hard-coded colors); update the mocks so the app works with mocks on.

### 8. Schema change and docs

- Edit db/init (002 and 004) and add an idempotent upgrade script for existing volumes, `db/upgrades/006_analyst_feedback.sql` (outside db/init, so it never runs at volume creation): `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `public` and in every `ds_*` schema listed in public.datasets (a DO block). Document it in README next to the other database update instructions.
- New doc docs/analyst-feedback.md (Portuguese, plain words): the why, the four problems and the rule that neutralizes each, labels, exploration sample, split, weights, gate, simulated analyst and feedback-eval, and how to demo it. Update docs/model.md, docs/external-data.md (retraining section), docs/glossary.md (retorno dos analistas = analyst feedback, falso positivo confirmado = false_positive, sem evidência suficiente = insufficient_evidence, amostra de controle = exploration sample, precisão confirmada = confirmed precision, analista simulado = simulated analyst, trava de promoção = promotion gate), api/AGENTS.md, and .agents/skills/fraudradar-overview/SKILL.md (tables, routes, screens; keep the .claude/skills copy identical).

## Rules

- Code identifiers in English; comments, docs, logs and screen/API messages in Brazilian Portuguese.
- Features, labels-to-transactions mapping and score only in src/fraudradar. The model never reads ground_truth / Is_laundering / Laundering_type to score. The API never reads ground_truth.
- Heavy deps (lightgbm) only in the ml group; the API image uses only the api group (gate and feedback numbers reach the API through the card, like the metrics today).
- Never print or commit secrets, .env, data or models/. Never read data/SAML-D.csv in full.
- Work in this order and commit after each step, so partial work survives if you run out of context: (1) schema + decision reason + labels; (2) exploration sample; (3) feedback training + gate; (4) simulated analyst + feedback-eval; (5) API summary + recall removal; (6) front; (7) docs.

## Tests (write them with each step)

- Decisions: archive without reason → 422; reason on escalate/report → 422; false_positive → label 0; report → label 1; insufficient_evidence/escalate → no label; a later decision updates/removes the label; legacy archive rows with NULL keep working.
- Exploration: k accounts below the cut, none in the queue, deterministic for (dataset, week), 0 disables, excluded from suspicious accounts, monitoring counts and worker metrics; open-week recompute keeps decided exploration alerts.
- Feedback training (small synthetic dataset): split moves to the last feedback week and keeps ≥ 4 test weeks; open-week and post-cut labels excluded; simulation transactions excluded; label 0/1 transaction mapping; ground truth wins on conflict and conflicts are counted; weights only on training rows; refusal below MIN_FEEDBACK_LABELS; card `feedback` block.
- Gate: comparison computed on the same test period; promote 409 when failed; old cards promote as before.
- Simulated analyst: decides only undecided alerts of closed weeks, respects error/insufficient rates with a fixed seed, never touches human decisions, `--undo` restores; feedback-eval writes both metric sets.
- API: /monitoring no longer has recall/typology_accuracy/recall_series; /feedback/summary numbers and low_sample; the API never queries ground_truth (keep/extend the existing guard test if there is one).
- Web: decision form requires the reason only for archive; dashboard/monitoring render without recall; model section shows comparison, gate and disabled promote; vitest for the new hooks/schemas.

## Verification (report exact numbers; 0 skipped)

- `uv run ruff check . && uv run ruff format --check .`
- `TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_vinicius_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest`
- `cd web && pnpm install && pnpm lint && pnpm test && pnpm build`
- Apply db/upgrades/006_analyst_feedback.sql twice on a copy of an existing volume (idempotent) and report.
- If your machine has the full SAML-D loaded and at least 16 GB of RAM: run `simulate-analyst --dataset saml-d --from 2023-05-22 --to 2023-07-16`, then `feedback-eval --dataset saml-d --include-simulated`, and report both metric sets and the difference, honestly, whatever the result. Otherwise say it was not run.

## Delivery

- Commits on feat/analyst-feedback following CONTRIBUTING.md (one scope per commit, Portuguese, imperative, lowercase, ≤ 72 chars, footer `Prompt: 108` plus your Co-Authored-By line), then `git push -u origin feat/analyst-feedback`. Do not open a PR and do not merge: Pedro does it after PR #16.
- This prompt is registered by Pedro's Claude as 107 (it may not be on the branch; do not create it). Register your result in docs/vibe-coding/prompts/108-<your-name>-analyst-feedback-result.md (front matter: id 108, area geral, autor = you, destino Pedro, pai 107, data, tipo resposta): what changed, the verification commands and numbers, the feedback-eval result if run, decisions you took, and what is still open, in Portuguese. Commit it in a `docs:` commit.
- Final report to Pedro, in Portuguese: commits, test results, feedback-eval numbers (or why not run), anything not verified, decisions you took.
````
