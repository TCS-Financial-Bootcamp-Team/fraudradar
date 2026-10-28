---
id: 021
area: backend
autor: Claude Code (conta 1, líder)
destino: Claude Code (conta 2)
pai: 020
data: 2026-10-28
modelo: sonnet (revisor, somente leitura)
---

# Review: slice B (analyst decision and COAF communication)

You are a READ-ONLY reviewer. Do not edit or create any file. Repo: `C:\codigo\pessoal\fraudradar`.

- Brief the executor followed: `docs/vibe-coding/prompts/020-codex-api-decisao.md`.
- Under review: `api/rotas/decisoes.py`, `api/repositorios/decisoes.py`,
  `tests/api/test_decisoes.py`, `tests/api/test_comunicacao.py`.
- Contract they rely on: `api/schemas/alertas.py`, `api/dominio.py`, `api/dependencias.py`
  (`Conexao` = one transaction per request, rolled back when the route raises),
  `db/init/002_tabelas.sql`, `tests/api/conftest.py`.

**Precision matters more than recall.** Report only defects you can show with a concrete input and
the wrong result it produces. An empty list is a legitimate, good answer: do not fill it.

Look in exactly these categories:

1. **Invariants under failure and concurrency.** Every write path locks the alert row before reading
   the state it depends on. Every 404/409 is *raised*, so the transaction rolls back; no path writes
   and then returns an error normally. An approved communication closes the alert for both write
   endpoints. One alert never gets two drafts, including the path comunicar → arquivar → comunicar.
2. **The seams.** Compare field by field what these endpoints accept and return against
   `web/src/features/alertas/schemas/alertas.ts` (`decisaoSchema`, `aprovacaoSchema`,
   `alertaSchema`, `comunicacaoSchema`) and what `web/src/features/alertas/services/alertas-service.ts`
   sends and parses. Then the seam with the leader's code: `api/repositorios/monitoramento.py` counts
   `comunicados` from approved communications and `api/repositorios/semanas.py` writes `auditoria`
   rows for the replay. Are the audit rows of both slices consistent (`acao`, `entidade`, `detalhes`)?
3. **The draft text.** Between 30 and 20000 characters for every input the schemas allow
   (justification up to 4000 chars, a parecer of any size, NULL `tipologia`, empty `paises`, score 0
   or 1); week shown Monday to Sunday; deterministic.

A wrong or missing rule in the brief (020) is a finding too (category `brief`).

Answer ONLY with this JSON, no prose around it:

```json
{"achados": [{"severidade": "alta|media|baixa", "categoria": "1|2|3|brief",
  "arquivo": "path", "linha": 0, "trecho": "the line copied literally from the file",
  "falha": "concrete input -> wrong result", "correcao": "minimal fix"}],
 "observacoes": "optional, short"}
```
