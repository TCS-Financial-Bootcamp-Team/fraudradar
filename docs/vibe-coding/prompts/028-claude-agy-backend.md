---
id: 028
area: backend
autor: Claude Code (conta 2)
destino: agy (Antigravity CLI, gemini-4-argon-high)
pai: 027
data: 2026-10-30
---

# Rename the FraudRadar backend to English

You are working in `C:\codigo\pessoal\fraudradar`, on branch `refactor/code-in-english`
(already checked out). Work autonomously until the task is done and the gate is green;
nobody will answer questions while you run.

## Why

FraudRadar PLD is a 5-person bootcamp project (anti-money-laundering monitoring over the
synthetic SAML-D dataset). Until now the code used Portuguese names. On 2026-10-30 the
project owner decided that **every name in the code becomes English**: functions,
variables, classes, types, modules, packages, folders, files, database tables, columns and
stored values, API routes and JSON fields, environment variables, CLI commands and flags.
**Portuguese stays only in text a person reads**: front-end screen text, API error
messages (they reach the screen), Markdown documentation, code comments and docstrings,
log and CLI messages, test descriptions, commit messages.

## The binding spec: `docs/glossary.md`

Read `docs/glossary.md` in full before touching anything. It maps every name that crosses
a boundary (database ↔ API ↔ front end, env vars, routes, CLI flags, folders, files).
Those names must match the glossary **exactly**: two other agents are renaming the front
end (`web/`) and the VibeLog (`vibelog/`) right now, in separate worktrees, from the same
glossary, and any deviation breaks the integration. For internal names the glossary does
not list, translate by meaning with its vocabulary, in idiomatic English, keeping the
existing conventions (snake_case in Python and SQL, PascalCase for classes). If you need a
boundary name the glossary does not cover, choose the obvious translation, use it
consistently and list it in your final report. Do not edit `docs/glossary.md`.

## Rules

1. **Rename only.** No behavior, logic, dependency or lockfile changes, no new features,
   no drive-by fixes. A bug you notice goes in the report.
2. **Keep Portuguese** in: HTTP error `detail` messages, values shown on screen (e.g.
   `"Indefinida"`, `"Indefinido"`), comments, docstrings, Pydantic/OpenAPI `description`
   strings, log messages, CLI help, test docstrings, Markdown prose. When such text
   mentions a renamed identifier, path, table, column, endpoint, env var or command,
   update the mention so it stays true.
3. **External contracts that do not change**: SAML-D column names and values (the CSV
   header, `RENOMEAR`'s keys, `PedidoTransacao`'s fields); the legacy Supabase Auth
   metadata key `nome` (read `name` first, then fall back to `nome`); see "O que não muda"
   in the glossary.
4. Use `git mv` for every rename (keeps history); move a whole directory with a single
   `git mv <old> <new>` so untracked files inside it move too. Afterwards delete empty
   leftover directories and stale `__pycache__` folders under old names.
5. **Ownership**: everything in the repository **except** `web/`, `vibelog/`,
   `docs/vibe-coding/prompts/` and `trash/` — never edit files inside those. Root-level
   docs that mention web/vibelog names (`README.md`, `AGENTS.md`, `CONTRIBUTING.md`,
   `api/AGENTS.md`, `docs/README.md`, `.env.example`) are yours: update those mentions from
   the glossary.
6. Never push, merge, rebase or change git config. Never run `docker compose down -v`.
   The Postgres container at `localhost:5432` (Compose service `db`) is already running:
   leave it running.
7. Windows 11 + PowerShell: set env vars with `$env:NAME = "value"`.
8. **Commits** on the current branch: a few logical commits, each leaving the gate green.
   Conventional Commits in Brazilian Portuguese as in `CONTRIBUTING.md` (imperative,
   lowercase, no period, at most 72 chars; body says why). A contract change gets `!` and
   a `BREAKING CHANGE:` paragraph: schema ("exige docker compose down -v"), renamed env
   vars, renamed endpoints and JSON fields, renamed worker CLI. Keep a change and the code
   that reads it in the same commit (e.g. `ci.yml`'s `REQUIRE_TEST_DB` with the conftest
   that reads it). Suggested split: (1) schema + Python packages + API + worker + tests +
   config + CI; (2) root folders `dados/`, `laboratorio/` and the ignore files;
   (3) Compose and Terraform; (4) docs. End every message with:

   ```
   Prompt: 028
   Co-Authored-By: agy (Antigravity CLI, gemini-4-argon-high)
   ```

## Read first

`AGENTS.md`, `api/AGENTS.md`, `CONTRIBUTING.md`, `docs/glossary.md`,
`db/init/002_tabelas.sql`, `tests/api/conftest.py`, `tests/conftest.py`,
`src/fraudradar/config.py`.

## Baseline (before any change)

```powershell
$env:EXIGIR_BANCO_TESTE = "1"
$env:TEST_DATABASE_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_agy_teste"
uv run ruff check . ; uv run ruff format --check . ; uv run pytest
```

Record the numbers (expected: green, about 279 passed, 0 skipped). If the baseline is not
green, stop and report.

## What to rename

1. **Database.** `git mv db/init/001_extensoes.sql db/init/001_extensions.sql`,
   `git mv db/init/002_tabelas.sql db/init/002_tables.sql`, `git mv db/regras db/rules`.
   Rewrite tables, columns, CHECK value lists, named indexes and constraints per the
   glossary ("Banco" and "Valores gravados"); comments stay Portuguese with the new names.
   Then update every SQL string in Python (repositories, routes, tests, the `Semente`
   seed): they are plain `text()` SQL, so search carefully, including f-string fragments
   such as `COLUNAS_ALERTA`, aliases, `RETURNING`, `ORDER BY`, JSONB keys
   (`evidence.rules` `code/description/detail`, `assessments.sources` `title/excerpt`,
   `weekly_batches.metrics` keys) and audit values (`audit_log.entity`/`action`).
2. **Python packages and modules** (glossary "Pastas e arquivos"):
   `src/fraudradar/banco.py→db.py`, `dados/→data/` (`ingestao.py→ingestion.py`),
   `modelo/→model/`, `ia/→ai/`; `api/rotas/→routes/`, `api/repositorios/→repositories/`,
   `api/dependencias.py→dependencies.py`, `api/dominio.py→domain.py`. Resource files:
   `alertas→alerts`, `decisoes→decisions`, `ia→ai`, `ingestao→ingestion`,
   `monitoramento→monitoring`, `saude→health`, `semanas→weeks`, `fila→alert_queue`.
   Tests: `test_comunicacao→test_reports`, `test_decisoes→test_decisions`,
   `test_detalhe→test_detail`, `test_fila→test_queue`, `test_grafo→test_graph`,
   `test_ingestao→test_ingestion`, `test_monitoramento→test_monitoring`,
   `test_semanas→test_weeks`, `tests/test_dados_ingestao→tests/test_data_ingestion`.
   Then every identifier inside: functions, classes, Pydantic models, constants (the ones
   the docs cite are fixed by the glossary), variables, parameters, fixtures
   (`banco→db`, `cliente→client`, `semente→seed`, `url_banco_teste→test_db_url`; class
   `Semente→Seed` and its methods), test function names (`test_<english>`).
3. **API contract**: routes, path parameter names (`alerta_id→alert_id`), query params,
   the multipart field `file`, Pydantic models and their JSON fields and literal values,
   exactly as in the glossary "API" and "JSON" sections; OpenAPI tags too. The front
   end's `statusSchema` values are `pending, escalated, archived, reported`, so the
   database↔front status maps in `domain.py` change accordingly.
4. **Config and env vars**: `AUTH_DESLIGADA→AUTH_DISABLED`, `DADOS_DIR→DATA_DIR`,
   `INGESTAO_MAX_BYTES→INGESTION_MAX_BYTES`, `INGESTAO_MAX_LINHAS→INGESTION_MAX_ROWS`,
   `EXIGIR_BANCO_TESTE→REQUIRE_TEST_DB`, default `MODEL_FILE=lightgbm_model.txt`. The test
   database name must end in `_test` (default `fraudradar_test`): keep the guard that
   refuses any other name, because the fixture drops that database.
5. **Worker CLI**: `lote --semana` → `batch --week` (help text stays Portuguese).
6. **Root folders**: `git mv dados data` (it holds the untracked 1 GB `SAML-D.csv`:
   confirm it moved with the folder), `git mv laboratorio lab`. `.gitignore`: `data/*` +
   `!data/README.md`, `lab/*` + `!lab/README.md`, and keep ignoring the legacy `dados/`
   and `laboratorio/` so an old checkout can never commit the CSV. Same idea in
   `.dockerignore` and in ruff's `extend-exclude` in `pyproject.toml`.
7. **Infra**: `infra/docker-compose.yml` (`../data:/app/data`, healthcheck `/health`);
   `.github/workflows/ci.yml` (`REQUIRE_TEST_DB`); `.env.example` (new names, Portuguese
   comments). Terraform in `infra/terraform`: `docker_network.rede→docker_network.network`
   plus a `moved {}` block, `var.prefixo→var.prefix`, `local.raiz→local.root`, trigger key
   `codigo→code`, output `rede→network`, network name suffix `-rede→-network`
   (descriptions stay Portuguese). Run `terraform fmt -check -recursive`, then
   `terraform init -backend=false -input=false` and `terraform validate`, if terraform is
   installed; otherwise say so in the report.
8. **Docs you own**: keep the Portuguese prose; update every mention of renamed things
   (paths, tables, columns, endpoints, JSON fields, env vars, commands, constants).
   `git mv docs/requisitos_projeto.MD docs/project-requirements.md` and fix links to it.
   In `AGENTS.md`, replace "Docs e comentários em PT-BR; conceitos de domínio com nomes em
   português (tabelas, endpoints, pacotes)." with:

   > Código em inglês: identificadores, arquivos, pastas, tabelas e colunas, valores
   > gravados, rotas, campos JSON, variáveis de ambiente e comandos. Em PT-BR: textos de
   > tela, documentação, comentários e mensagens de log e de erro. O mapa entre os termos
   > do time e os nomes do código está em `docs/glossary.md`; nome novo segue o glossário.

   and bring its layout, commands and rules up to date. In `CONTRIBUTING.md`: commit
   scopes `dados→data`, `modelo→model`, `ia→ai`; commit type `modelo→model`; branch
   examples in English (`feat/web-csv-ingestion`, `fix/api-country-filter`); example
   endpoints; `pnpm vibelog importar-md` → `pnpm vibelog import-md`.

## Gate (after)

```powershell
Remove-Item Env:EXIGIR_BANCO_TESTE -ErrorAction SilentlyContinue
$env:REQUIRE_TEST_DB = "1"
$env:TEST_DATABASE_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_agy_test"
uv run ruff check . ; uv run ruff format --check . ; uv run pytest
```

Green, same test count as the baseline, 0 skipped. Also:

- Print the routes and compare them with the glossary:
  `uv run python -c "from api.main import app; [print(sorted(r.methods), r.path) for r in app.routes if hasattr(r, 'methods')]"`.
- Write `app.openapi()` to `trash/agy-openapi.json` and check every component schema's
  field names and enum values against the glossary's JSON table (the orchestrator uses
  this file to check the front end).
- `docker compose config -q`.
- **Leftover scan**: search the code you own (outside strings and comments) for Portuguese
  stems with `rg --pcre2 -i`, e.g.
  `alerta|conta(?!in|ct)|semana|transac(?!t)|decis(?!ion)|comunic|parecer|evidenci|regra|tipolog|pais|valor|moeda|fila|lote|grafo|aresta|banco|dados|usuario|mensagem|resposta|pedido|recibo|fonte|ingest[ao]|saude|monitora|indicador|taxa|rotulo|nome|texto|titulo|trecho|linha|coluna|arquivo|caminho|pagina|tamanho|ordenar|origem|destino|rascunho|aprova|justificativa|analista|auditoria|semente|cliente|erro(?!r)|detalhe|contexto|historico|papel|chave|corpo|cabecalho|criar|listar|obter|gravar|validar|atualizar`.
  Every identifier hit must go; Portuguese inside strings, comments and docs may stay
  per rule 2.

## Final report (in English)

Commits (hash and subject); baseline vs. final gate numbers; the route list; boundary
names you chose that the glossary does not cover; intentional Portuguese leftovers,
grouped by reason; anything unfinished; bugs or risks you noticed but did not fix.
