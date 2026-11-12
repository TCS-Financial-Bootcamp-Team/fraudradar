---
id: 103
area: geral
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code (conta 2 do Pedro, Sonnet)
pai: 098
data: 2026-11-11
---

# Delegação ao Sonnet: integração das frentes B1, B2 e C

Depois de juntar as três frentes (523 testes Python e 58 do front verdes), o Claude resolveu os conflitos (`api/main.py`, `worker/jobs.py`, `PRE_PROCESS_HOOKS` duplicado) e tirou um ALTER de restrição que um teste do B2 fazia na sessão inteira. Os itens que sobraram das revisões vão neste prompt.

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch feat/external-datasets. Three parallel lanes were just merged here (continuous processing + suspicious accounts + simulator; external Postgres connections + import; retraining + promotion); everything is green (523 Python tests, 58 web tests, build). A review found the integration items below. Fix exactly these, with tests, and change nothing else. You are running non-interactively: do not ask questions; print a final report in Portuguese at the end.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, api/AGENTS.md, web/AGENTS.md, web/DESIGN.md, docs/external-data.md. Code in English; comments, docs and on-screen text in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets. Tests only in databases ending in `_test`.

1. The API must never read ground_truth (api/AGENTS.md). Today GET/POST of models calls src/fraudradar/model/eligibility.py `training_block_reason`, which queries ground_truth from the API (and joins 9.5 M rows: it will hit the 15 s statement timeout on SAML-D). Move the computation to the worker: add to public.datasets the columns `labeled_weeks INT NOT NULL DEFAULT 0`, `has_laundering BOOLEAN NOT NULL DEFAULT false`, `labels_checked_at TIMESTAMPTZ` (in db/init/003_platform.sql, seeding saml-d's values as 0/false — the worker fills them), computed by the worker after `load`, after an `import` that wrote ground truth, and after each `train`; the API's eligibility reads only these registry columns (keep the same Portuguese reasons). Update api/AGENTS.md if needed so the rule stays true. Tests: API refusal/acceptance driven by the registry; worker updates the registry; a test that the API code path never issues a query on ground_truth.
2. Front error messages: web/src/lib/api.ts throws "Não foi possível concluir a solicitação (NNN). Tente novamente." and drops the API's `detail` (FastAPI). Show the API's `detail` when it is a string (fall back to the generic text otherwise; keep the 401 session message); apply the same to the multipart upload path. Add `apiDelete`. Then wire the "Remover" action for external connections in the Fontes de dados connections card (with a confirmation), using the existing DELETE route, and remove the now-unneeded `explainApiError` mapping if it only duplicated messages the API already sends.
3. One job type in the front: the job schema/type and the polling hook exist twice (features/ingestion and features/processing, maybe features/models). Keep a single shared implementation (e.g. web/src/features/jobs/{schemas,services,hooks}) and use it in the three places.
4. "Processar agora" and the simulator must also be reachable from Fontes de dados (mount the existing ProcessingControls there, the simulator only when demo mode is on, as on the dashboard).
5. src/fraudradar/sources/connection.py `describe_error` does `.replace(source.password, "***")`; with an empty password `str.replace("", "***")` inserts *** between every character. Guard it.
6. Model version naming: per-dataset versions (models/<slug>/lightgbm_vN) can collide in name with the official versions (models/lightgbm_vN) where versions are shown or stored (model_versions, datasets.active_model_version, API responses). Make dataset versions unambiguous (e.g. store and show `<slug>/v2`, or a prefix) without changing how the official SAML-D model is stored or loaded; tests.
7. Remove dead code left by the merge (e.g. `_not_implemented` in worker/jobs.py if nothing uses it) and make sure `PRE_PROCESS_HOOKS` is defined once.
8. Docs: web/API_CONTRACTS.md rows for the models routes (GET /datasets/{slug}/models, POST /datasets/{slug}/train, POST /datasets/{slug}/models/{version}/promote) and the README route table; .env.example must document CONNECTIONS_SECRET_KEY (how to generate a Fernet key with uv run python -c ...) and EXTERNAL_DB_ALLOWED_HOSTS; infra/docker-compose.yml must pass both to api and worker-serve from .env.

Verification (report exact summaries, 0 skipped):
- uv run ruff check . && uv run ruff format --check .
- TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_integ_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest
- cd web && pnpm lint && pnpm test && pnpm build
````
