---
id: 023
area: backend
autor: Claude Code (conta 1, líder)
destino: Claude Code (conta 2)
pai: 022
data: 2026-10-28
modelo: sonnet (verificador, somente leitura)
---

# Verify the leader's fixes after the reviews

You are a READ-ONLY verifier. Do not edit or create any file; do not run git. You may run
read-only commands, including SELECT queries on the dev database (`docker exec fraudradar-db-1 psql
-U fraudradar -d fraudradar -c "..."`). Repo: `C:\codigo\pessoal\fraudradar`.

Each item below is a claim. Your job is to **prove it false**, with a concrete input and the wrong
result, citing `file:line` and the line copied literally. "Not refuted" is a legitimate answer and
it is NOT an approval. Do not report anything outside these claims.

1. `api/repositorios/decisoes.py` — a second `comunicar` on an alert regenerates the draft with the
   current justification and newest parecer, keeps a single draft row, and never touches an approved
   communication.
2. `api/dependencias.py` — with `PyJWKClient(..., lifespan=600)` and no `cache_keys`, a key removed
   from the project's JWKS stops authenticating at most ~10 minutes after removal; tokens with
   an unknown `kid` cannot make the API fetch the JWKS more than once per 30 s.
   (PyJWT source: `.venv/Lib/site-packages/jwt/jwks_client.py`, `jwk_set_cache.py`.)
3. `api/rotas/alertas.py` — no value of `pagina`/`tamanho` accepted by the route can make
   PostgreSQL fail on `OFFSET`/`LIMIT`.
4. `api/repositorios/fila.py` + `src/fraudradar/dados/schema.py` — SAML-D `Amount` is in pounds
   whatever `Payment_currency` says, so returning `moeda = "GBP"` (and the original label in
   `moeda_pagamento`) is the correct contract for `web/src/features/alertas/components/detalhe-alerta.tsx`,
   which formats `valor` with `Intl.NumberFormat(..., {style: "currency", currency: m.moeda})`.
   The evidence used: `SELECT moeda_pagamento, percentile_cont(0.5) WITHIN GROUP (ORDER BY valor)
   FROM transacoes GROUP BY 1` gives a median of ~6–8 thousand for all 13 currencies, and the
   project dossier says the dataset is "em libras". Attack the inference, not just the code.
5. `web/src/lib/formatacao.ts` — every caller of `moeda()` formats a value that comes from SAML-D
   amounts (so GBP is right for all of them).

Answer ONLY with this JSON:

```json
{"vereditos": [{"item": 1, "veredito": "refutado|nao_refutado",
  "arquivo": "path or null", "linha": 0, "trecho": "literal line or null",
  "prova": "concrete input -> wrong result, or why no counterexample was found"}]}
```
