---
id: 019
area: backend
autor: Claude Code (conta 1, líder)
destino: Claude Code (conta 2)
pai: 018
data: 2026-10-28
modelo: sonnet
---

# Slice A — alert queue, alert detail and 2-hop graph (FastAPI)

Repo: `C:\codigo\pessoal\fraudradar` (Windows, PowerShell). Read `AGENTS.md` first (hard project
rules). You are one of three agents working in this working tree at the same time, on disjoint
files. Another agent is writing `api/rotas/decisoes.py`; the leader is writing semanas/replay/
monitoramento. Do not touch their files.

## The contract (read it, do NOT edit it)

- `api/schemas/alertas.py` — Pydantic models mirroring the front's zod schemas
  (`web/src/features/alertas/schemas/alertas.ts`). Your endpoints return `Fila`, `Detalhe`, `Grafo`.
- `api/dominio.py` — status mapping, `AlertaId`, `COLUNAS_ALERTA`, `alerta_de_linha`,
  `linha_do_alerta` (404), `segunda_feira`. Reuse them; do not duplicate the mapping.
- `api/dependencias.py` — `Conexao` (one transaction per request; just `conn.execute(...)`, never
  commit). Auth is already applied to your router in `api/main.py`.
- `db/init/002_tabelas.sql` — the schema. The SQL comments define the JSON formats of
  `evidencias.contribuicoes`, `evidencias.regras` and `pareceres.fontes`.
- `tests/api/conftest.py` — fixtures `cliente` (TestClient, auth off), `semente` (inserts rows),
  `banco` (engine). Use `semente` to build every scenario.
- `src/fraudradar/features/__init__.py` — `rotulo_feature(nome)` gives the display label.

If you believe something in the contract is wrong, do not edit it: say so in the final report, with
the concrete case that breaks.

## YOUR FILES (only these)

- `api/rotas/alertas.py` (router already exists with prefix `/alertas`)
- `api/repositorios/fila.py` (new; SQL lives here, routes stay thin)
- `tests/api/test_fila.py`, `tests/api/test_detalhe.py`, `tests/api/test_grafo.py` (new)

## Endpoints

### GET /alertas → `Fila`
Query params: `semana` (date, required; normalize with `segunda_feira`), `status`
(`StatusAlerta`, optional), `pais` (str 1..80, optional), `pagina` (int ≥ 1, default 1),
`tamanho` (int 1..100, default 10), `ordenar` (`"score_desc"` | `"fila"`, default `"score_desc"`).
- Filters: `a.semana = :semana`; status → `a.status = ANY(...)` with `STATUS_DO_FRONT` (so
  `pendente` matches both `novo` and `em_analise`); `pais` → array containment on `a.paises`
  (there is a GIN index on it).
- Order: `score_desc` → `score DESC, posicao_fila, id`; `fila` → `posicao_fila, id`.
- `total` = count with the same filters; `itens` = the page (`LIMIT/OFFSET`); a page past the end
  returns `itens: []` with the right `total`.
- `paises` = sorted distinct countries of **all** alerts of that week (ignores `status`/`pais`
  filters, so the front's dropdown keeps every option).
- A week without alerts → `{"itens": [], "total": 0, "paises": []}` with 200.

### GET /alertas/{alerta_id} → `Detalhe`
Base fields: `alerta_de_linha(linha_do_alerta(conn, alerta_id))` (404 when missing). Plus:
- `contribuicoes` from `evidencias.contribuicoes` (JSON object feature → SHAP value; the row may
  not exist). Keep only numeric values > 0; `valor` = value / sum of **all** positive values × 100,
  rounded to 1 decimal; sort desc; top 6; `nome = rotulo_feature(feature)`. No positives → `[]`.
- `regras` from `evidencias.regras` (JSON array): each item that is an object with string `codigo`
  and `descricao` becomes a `Regra`, in order; skip anything malformed.
- `movimentacoes`: transactions where the alert account is sender **or** receiver and
  `data_hora` is in `[semana 00:00, semana + 7 days 00:00)`, ordered by `data_hora, id`, at most 200.
  Map `id=str(t.id)`, `data=data_hora.isoformat()`, `origem/destino=str(remetente/recebedor)`,
  `valor=float`, `moeda=moeda_pagamento`, `meio=tipo_pagamento`. A self-transfer appears once.
  Write it index-friendly: the indexes are `(remetente, data_hora)` and `(recebedor, data_hora)`
  (e.g. `UNION ALL` of the two directions, the second excluding `remetente = conta`).
- `parecer`: newest row of `pareceres` for the alert (`criado_em DESC, id DESC`) →
  `Parecer(texto, fontes)`; `fontes` items need string `titulo` and `trecho` (skip malformed).
  No parecer → `null`.

### GET /alertas/{alerta_id}/grafo → `Grafo`
404 via `linha_do_alerta`. Same week window as above. Edges aggregate transactions by
`(remetente, recebedor)` with `valor = SUM(valor)`.
- Hop 1: aggregated edges where the alert account is origin or destination; keep the 30 largest by
  `valor` (ties: origem, destino).
- Hop 2: aggregated edges where origin or destination is a hop-1 counterparty, excluding edges
  that touch the alert account; keep the 30 largest by `valor`.
- Nodes: the alert account with `central=True`, then every endpoint of the kept edges with
  `central=False`, sorted by id; `id = rotulo = str(conta)`. Edge `id = f"{origem}-{destino}"`.
- Account without transactions in the week → only the central node, no edges.

## Tests (pytest, against real Postgres)

Postgres is running (container `fraudradar-db-1`, localhost:5432). The `banco` fixture drops and
recreates the database named in `TEST_DATABASE_URL`, so **use your own database** — before every
pytest run:

```powershell
$env:TEST_DATABASE_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_a_teste"
$env:EXIGIR_BANCO_TESTE = "1"   # without Postgres the tests FAIL instead of being skipped
uv run pytest tests/api -q
uv run ruff check . ; uv run ruff format --check api/rotas/alertas.py api/repositorios/fila.py tests/api
```

A run where the API tests are *skipped* is not a pass. Never touch the databases `fraudradar` or `fraudradar_teste`.

Every rule with more than one branch needs a test per branch that **fails if that branch is
removed** — not only the example case. At minimum: each status filter mapping (including
`pendente` = novo + em_analise), country containment with a multi-country alert, week isolation,
week normalization (a Wednesday finds the Monday's alerts), pagination and `total`, both orderings
with ties, `paises` ignoring the other filters, 404s, 422 for an invalid `status`; contributions
(negatives dropped, percentage over all positives, top 6, label fallback, missing evidencias row);
malformed regras/fontes skipped; movement window boundaries (exactly `semana 00:00` included,
exactly `semana + 7d 00:00` excluded), both directions, self-transfer once, the 200 cap; newest
parecer wins; graph hop 1 and hop 2, aggregation of repeated pairs, out-of-week transactions
excluded, both caps, empty week.

Do at least two real mutation checks: break one branch on purpose, run, see red, restore. Report
the literal red line.

## Rules

- No git commands at all (no commit, stash, checkout, reset). The leader versions everything.
- Do not reformat or edit files outside YOUR FILES. Do not start servers.
- PT-BR identifiers, docstrings and comments, short; follow `api/rotas/saude.py`,
  `api/rotas/ia.py` and `api/dominio.py`. Low comment density: comment the why, not the what.
- SQL only through `text()` with bound parameters. Never format user input into SQL.
- Never read `dados/SAML-D.csv`.

## Final report (in Brazilian Portuguese)

1. Files created/changed and the final `pytest` and `ruff` output (counts).
2. For each rule above: test name → what code change makes it red.
3. The two mutation checks with the literal red line.
4. Anything in the contract or in this brief that you think is wrong, with the concrete case.
   Saying "nothing" is a legitimate answer.
5. Your reasoning (not code) on these open decisions, with the cost of being wrong either way:
   a. Should `GET /alertas` hide weeks the replay has not released yet
      (`lotes_semana.liberada_em IS NULL`)? The leader decided no.
   b. Hub accounts can have thousands of transactions a week. Are the 200 / 30 / 30 caps right for
      an analyst screen, given the front contract has no field to signal truncation?
   c. Showing only positive SHAP contributions as percentages: does it mislead the analyst?
