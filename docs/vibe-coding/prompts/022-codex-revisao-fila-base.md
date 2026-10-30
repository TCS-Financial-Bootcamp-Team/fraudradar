---
id: 022
area: backend
autor: Claude Code (conta 1, líder)
destino: Codex
pai: 019
data: 2026-10-28
modelo: gpt-6.1-sol / reasoning high (revisor)
---

# Review: slice A (queue, detail, graph) and the leader's foundation

You are a REVIEWER. Do not edit, create or delete any file in the repo; do not run git commands that
change anything. You may run read-only commands. Repo: `C:\codigo\pessoal\fraudradar`.

Under review:
- Slice A (brief `docs/vibe-coding/prompts/019-claude2-api-fila.md`): `api/rotas/alertas.py`,
  `api/repositorios/fila.py`, `tests/api/test_fila.py`, `tests/api/test_detalhe.py`,
  `tests/api/test_grafo.py`.
- The leader's code: `api/dependencias.py` (DB transaction per request, Supabase JWT validation),
  `api/dominio.py`, `api/main.py`, `api/schemas/*.py`, `api/rotas/semanas.py`,
  `api/rotas/replay.py`, `api/rotas/monitoramento.py`, `api/repositorios/semanas.py`,
  `api/repositorios/monitoramento.py`, `db/init/002_tabelas.sql`.

**Precision matters more than recall.** Report only defects you can show with a concrete input and
the wrong result it produces. An empty list is a legitimate, good answer: do not fill it.

Look in exactly these categories:

1. **SQL on the real data.** The dev database `fraudradar` on localhost:5432 (user and password
   `fraudradar`) has ~900k real SAML-D transactions and 331 demo alerts. Use `EXPLAIN (ANALYZE)` there
   (read-only queries only) to check that the movement and graph queries in `api/repositorios/fila.py`
   use the `(remetente, data_hora)` / `(recebedor, data_hora)` indexes, and look for wrong results at
   the week boundaries, in the aggregation and in the caps.
2. **The seam with the front.** Compare field by field what the API returns against the zod schemas
   in `web/src/features/alertas/schemas/alertas.ts` (`filaSchema`, `detalheSchema`, `grafoSchema`,
   `monitoramentoSchema`, `replaySchema`) and the query string `buscarAlertas` sends in
   `web/src/features/alertas/services/alertas-service.ts`. A response the front's `.parse()` would
   reject is a high-severity finding.
3. **Auth and abuse.** JWT validation in `api/dependencias.py` (algorithm confusion, issuer,
   audience, anonymous users, JWKS outage), CORS in `api/main.py`, any user input reaching SQL text,
   and requests that can make the API do unbounded work.

A wrong or missing rule in the briefs or in the contract is a finding too (category `brief`).

Answer ONLY with this JSON, no prose around it:

```json
{"achados": [{"severidade": "alta|media|baixa", "categoria": "1|2|3|brief",
  "arquivo": "path", "linha": 0, "trecho": "the line copied literally from the file",
  "falha": "concrete input -> wrong result", "correcao": "minimal fix"}],
 "observacoes": "optional, short"}
```
