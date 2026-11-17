---
id: 132
area: backend
autor: Claude Code (conta 2, do Pedro)
destino: Codex CLI (conta 2 do Pedro)
pai: 131
data: 2026-11-17
---

# Delegação ao Codex: evidências jurídicas que não cabem no contexto

Prompt enviado, na íntegra, numa branch nova da `main` (`fix/ai-legal-context-count`):

````text
You are working in the FraudRadar repository at C:\codigo\pessoal\fraudradar (Windows; PowerShell and Git Bash available), on branch `fix/ai-legal-context-count`, created from origin/main. Read AGENTS.md and api/AGENTS.md first: identifiers in English; comments, docstrings and log/error messages in Brazilian Portuguese. Do NOT run git commit, merge, rebase, reset, checkout, switch, restore, stash, add or push; leave the changes in the working tree for review. Do not touch docs/vibe-coding/prompts/. Do not start or stop Docker containers. Never call the real Gemini API in tests.

## Bug (seen in production today, reproduced locally)
The alert chat (`POST /alerts/{id}/chat`) answers an unhandled 500 for some questions, and the same can happen to `POST /chat` and to the assessment:

```
File "src/fraudradar/ai/legal_pipeline.py", line 71, in generate_from_prepared_evidence
    raise ValueError("Quantidade de evidencias inconsistente.")
```

Root cause:
- `format_legal_context` (src/fraudradar/ai/legal_context.py) silently skips (`continue`) a document whose JSON entry does not fit in `max_total_chars`, and also skips a repeated `(source, chunk_index)`. The JSON uses `ensure_ascii=True`, so every accented letter costs 6 characters.
- `prepare_legal_evidence` (src/fraudradar/ai/legal_retrieval.py) still returns all `count` documents and citation ids, while the context holds fewer entries.
- `generate_from_prepared_evidence` then compares `answer.evidence_count` (the entries parsed from the context) with `len(prepared.documents)` and raises.

Local reproduction with the real legal base: for the question "Que diligências o analista pode fazer neste alerta?" the search returns Art. 12, Art. 4-A and Art. 11 (3 documents) but the context holds 2 entries (max_total_chars=5000).

## Fix
1. In `prepare_legal_evidence`, accept a formatted context only when the number of evidence entries in it equals the number of documents tried. Count the entries by parsing the JSON part of the context, the same way `_parse_context` in legal_generation.py does; do not count substrings. Otherwise keep the existing fallback and try with fewer documents. The returned `documents` and `citation_ids` must always match the entries of the returned context, one to one and in order.
2. Keep the consistency check in `generate_from_prepared_evidence` as a safety net, and keep `format_legal_context` behaviour and signature unchanged (other code and tests use it).
3. Regression tests, offline:
   - documents whose combined entries exceed `max_total_chars` give a prepared result with fewer documents, whose count and citation ids match the context entries;
   - the same prepared result goes through `generate_from_prepared_evidence` with a fake generator (built like the existing tests) without raising;
   - a repeated `(source, chunk_index)` among the hits does not cause a mismatch.
   Put them next to the existing legal retrieval/pipeline tests.

## Verify (report the numbers)
- `uv run ruff check .` and `uv run ruff format --check .`. Use `uv run`, never `uv sync`.
- `uv run pytest` with TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:55433/fraudradar_codex_test and REQUIRE_TEST_DB=1 (the server is already running).

## Final report (in English)
Files changed, the exact rule now applied, tests added, verification numbers.
````

Resultado: `133-codex2-contexto-juridico-result.md`.
