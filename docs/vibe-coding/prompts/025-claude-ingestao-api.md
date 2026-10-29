---
id: 025
area: backend
autor: Claude Code (conta 1)
destino: Claude Code (PC do colega)
pai: 024
data: 2026-10-29
---

# Implement transaction ingestion in the FraudRadar API

> How to use: the teammate pastes everything below this line into Claude Code,
> opened at the root of the `fraudradar` clone.

---

You are joining FraudRadar PLD, a 5-person bootcamp project (anti-money-laundering
monitoring over the synthetic SAML-D dataset). Your task is to implement **transaction
ingestion** in the FastAPI backend. You have no access to the other agents' memory: the
repository is your only source of conventions, so read before you write.

Write code, comments, docs, commit messages and the PR in **Brazilian Portuguese**, like
the rest of the repo. Domain names stay in Portuguese.

## 0. Setup

```powershell
git fetch origin
git switch feat/api-base        # the API lives here (PR #1); if PR #1 is already merged, use main
git switch -c feat/api-ingestao
uv sync --all-groups
copy .env.example .env          # then set AUTH_DESLIGADA=true in .env (dev only)
docker compose up -d db
```

## 1. Read first (all of it, before any code)

1. `AGENTS.md`, `api/AGENTS.md`, `CONTRIBUTING.md` — project rules, API architecture,
   commit format, test-database rules. They are binding.
2. `web/CONTRATOS_API.md`, section "Ingestão: contratos novos" — the contract the
   frontend already implements.
3. `web/src/features/ingestao/schemas/ingestao.ts` and
   `web/src/features/ingestao/services/ingestao-service.ts` — exact request shapes.
4. `api/rotas/ingestao.py`, `api/schemas/ingestao.py` — the current 501 stubs.
5. `api/rotas/decisoes.py` + `api/repositorios/decisoes.py` — the reference pattern
   (thin route, repository with `text()`, `auditoria`, error codes).
6. `src/fraudradar/dados/schema.py` and `db/init/002_tabelas.sql` (table `transacoes`).
7. `tests/api/conftest.py` and one existing test file, e.g. `tests/api/test_decisoes.py`.

Never read `dados/SAML-D.csv` whole (1 GB): use `head` or `nrows`.

## 2. Scope

In scope:

- `POST /ingestao/csv` — multipart, field `arquivo`, SAML-D CSV without the label columns.
- `POST /ingestao/transacoes` — one transaction as JSON (`transacaoSchema`).

Out of scope (leave as they are: `GET /ingestao/conexoes` returns an empty list, the
other `conexoes` routes return 501):

- Registering and syncing external Postgres sources. Storing third parties'
  credentials and opening connections to user-supplied hosts (SSRF) needs its own
  design; do not start it.
- `/alertas/{id}/parecer` and `/chat` (they depend on the RAG, owned by another part of the team).
- Anything under `web/`. If the frontend contract looks wrong or incomplete, report it;
  do not change the frontend.

## 3. Requirements

1. **Validation lives in `src/fraudradar/dados`** (e.g. a new `ingestao.py`), not in
   `api/`: the worker will reuse it. The API route parses the request, calls it, and
   writes through a repository in `api/repositorios/ingestao.py`.
2. **Header**: exactly the 11 columns of `COLUNAS_TRANSACAO`. Decide whether the column
   order must match and document it. Missing or extra columns → 422 with a clear message.
   `Is_laundering` / `Laundering_type` must be rejected explicitly: labels never enter
   the system through the API, and nothing is written to `avaliacao`.
3. **Every row is validated**, not a sample. All or nothing: one bad row rejects the
   whole file, and nothing is persisted. The 422 lists the first errors with line
   number and column (cap the list, e.g. 20).
4. Field rules (mirror the zod schema, the API is authoritative):
   - `Date` ISO `AAAA-MM-DD`; `Time` `HH:MM` or `HH:MM:SS`; together they become
     `data_hora` (no timezone).
   - `Amount` finite and > 0 (stricter than the DB `CHECK >= 0`, matching the front).
   - Currency labels are stored as received in `moeda_pagamento` / `moeda_recebida`.
     Never convert or sum by currency: amounts are in pounds whatever the label
     (`MOEDA_DOS_VALORES`).
   - **Account mismatch to resolve**: the front accepts `Sender_account` /
     `Receiver_account` as strings up to 64 chars, but the columns are `BIGINT`. Accept
     only digit strings that fit a positive BIGINT and reject the rest with a clear
     message. Record the decision in the PR and in `web/CONTRATOS_API.md`'s ingestion
     section (docs only, no frontend code).
5. **Size and time**: each request runs in one transaction with a 15 s
   `statement_timeout` (`Conexao`). Define an upload limit (bytes and rows) that fits
   that budget, enforce it while streaming (never read the whole upload into memory
   first), answer 413 above it, and put the limit in the README. Use PostgreSQL `COPY`
   through the psycopg driver connection if row-by-row `INSERT` is too slow; measure
   with a generated file at the limit. Loading the full SAML-D is the worker's job,
   not the API's.
6. **Receipt and audit**: each ingestion gets a record (a new table such as
   `ingestoes`: id, origem `csv|manual`, nome_arquivo, linhas, status, quem, criado_em)
   whose id is `Recibo.id`. `status` is `recebido` after a successful insert: scoring
   happens later, when the worker runs the week. Write an `auditoria` row with
   `UsuarioAtual`. The schema change goes only in `db/init/002_tabelas.sql`, in its own
   `feat(db)!` commit with the "exige docker compose down -v" warning.
7. **Pydantic mirrors zod**: `transacaoSchema` is `.strict()`, so the Pydantic model
   uses `extra="forbid"`. Keep the field names of the CSV (`Sender_account`, ...).
8. Update the README API table (the `/ingestao/*` row) and `api/AGENTS.md` only if
   you introduce a convention the next agent needs.

## 4. Tests

- Unit tests for the validator in `tests/` (no DB).
- API tests in `tests/api/test_ingestao.py` using the `cliente` and `banco` fixtures:
  valid CSV inserts N rows and returns the receipt; header with `Is_laundering` → 422;
  missing column → 422; one bad row → 422 with its line number and **zero rows
  persisted**; oversized upload → 413; non-numeric account → 422; single transaction
  OK; `auditoria` row written with the local analyst name.
- Run the gate with your own test database, as `api/AGENTS.md` explains, and with
  `EXIGIR_BANCO_TESTE=1`. A green run with skipped API tests does not count.

```powershell
$env:EXIGIR_BANCO_TESTE = "1"
$env:TEST_DATABASE_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_ingestao_teste"
uv run ruff check . ; uv run ruff format --check . ; uv run pytest
```

## 5. Process

- Small commits per `CONTRIBUTING.md`, one scope each (`db`, `dados`, `api`, `docs`),
  footer `Prompt: 025` plus your `Co-Authored-By`.
- Push `feat/api-ingestao` and open a PR. Base: `feat/api-base` while PR #1 is open,
  otherwise `main`. Do not merge: a teammate reviews.
- Register your work for the VibeLog without its key, following the Markdown fallback
  in `CONTRIBUTING.md`: create `docs/vibe-coding/prompts/026-<you>-ingestao-resultado.md`
  (next free number if 026 is taken) with `pai: 025`, describing what you built, the
  decisions you made, the commits, and the gate output.
- Product questions (what the analyst sees, limits that change the demo) go in the PR
  description under "Decisões em aberto", each with your recommendation. Technical
  choices are yours: decide and write down why.

## 6. Final report (reply in this format)

1. What was implemented (routes, modules, table).
2. Decisions made and why (header order, account rule, size limit and measurement).
3. Gate output: ruff, format, pytest with the pass/skip counts.
4. Branch, commits, PR link.
5. Open questions for the team.
