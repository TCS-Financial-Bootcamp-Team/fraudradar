---
id: 121
area: backend
autor: Claude Code (conta 2, do Pedro)
destino: Codex CLI (conta 2 do Pedro)
pai: 120
data: 2026-11-17
---

# Delegação ao Codex: parecer e chat do alerta (branch do Victor sobre a main nova)

Prompt enviado, na íntegra, com a branch `feat/ai-alert-assessment` (commit do Victor `abc3f3b` mais o merge da `main` em andamento):

````text
You are working in the FraudRadar repository at C:\codigo\pessoal\fraudradar (Windows; PowerShell and Git Bash are available). Read AGENTS.md, api/AGENTS.md and web/AGENTS.md first and follow them. The rules that matter most here:
- identifiers in English; comments, docstrings, log messages and the `detail` text of server errors in Brazilian Portuguese (with correct accents);
- every screen-facing API error is an `AppError(status, code, detail, params)` with a stable code that has PT-BR and EN texts in web/messages/*/errors.json (`errors.api`);
- every state-changing action writes `audit_log`;
- "LLM e RAG ficam em src/fraudradar/ai; a rota só chama";
- the LLM never receives account numbers; the API never reads `ground_truth`.

## Git state: do not change it
Branch `feat/ai-alert-assessment` = Victor's commit abc3f3b ("feat(ai): enable contextual assessments and alert chat") with `git merge origin/main` IN PROGRESS. Every file merged cleanly except api/routes/ai.py, which still has conflict markers. Do NOT run git commit, merge, rebase, reset, checkout, switch, restore, stash, add or push. Leave every change in the working tree; I will review and commit. Do not touch docs/vibe-coding/prompts/.

## Goal
Make the contextual alert assessment (POST /alerts/{id}/assessment) and the alert chat (POST /alerts/{id}/chat) correct and consistent with what is already on main (PR #22), keeping Victor's design: read the evidence in a short DB transaction and close it, call the reviewed legal RAG + Gemini, validate the citations, persist in a separate short transaction. The assessment is a draft for human review; it never makes a decision.

## Tasks
1. Resolve the merge conflict in api/routes/ai.py. Keep Victor's two alert routes and PR #22's handling for POST /chat. Use one shared error translator for the three routes:
   - `fraudradar.ai.legal_generation.LegalLlmNotConfiguredError` -> 503 `ai.not_configured`
   - `LegalEvidenceUnavailableError` -> 503 `ai.no_legal_sources`
   - `fraudradar.ai.legal_generation.LegalAnswerRejectedError` -> 502 `ai.provider_failed`
   - `google.genai.errors.APIError`: code 429 -> 429 `ai.provider_rate_limited`; code 503 -> 503 `ai.provider_unavailable`; anything else -> 502 `ai.provider_failed`
   - a generated assessment that fails validation -> 502 `ai.invalid_assessment`
   Remove the stray `from api.dependencies import DbConnection` at the end of the file and the matching on exception message text ("Mensagem de indisponibilidade").
2. Configuration first: both alert routes check the Gemini configuration with `fraudradar.ai.legal_generation.gemini_settings()` (raises `LegalLlmNotConfiguredError`) before opening the database and answer 503 `ai.not_configured`. Drop the `ai.model_not_configured` code. Persist the model name that `gemini_settings()` returns.
3. Blocking bug: the identifier guard treats the alert's database id as a secret and compares raw substrings, so alerts with short ids fail (every real database starts at id 1). `POST /alerts/7/assessment` returns an unhandled 500 before calling Gemini. With Postgres, `tests/api/test_base.py::test_assessment_generates_persists_and_returns_in_detail` fails with "O contexto possui identificadores financeiros." Fix it:
   - the alert's database id is not an account number and is not a forbidden identifier;
   - forbidden identifiers are the alert account, the movement counterparties (sender/receiver) and the transaction ids. Match them as whole numeric tokens: not inside a longer number and not as the integer part of a decimal such as `35102.0`. Never match raw substrings;
   - one implementation shared by every check (context, financial summary, final prompt, question sanitization);
   - regression test: contexts built for alert ids 1..5000 with realistic values (dates, scores, amounts, contribution percentages) are never blocked; a context that really contains the account or a counterparty is blocked.
4. No unhandled 500s. Any failure while preparing the context becomes an AppError:
   - the privacy guard blocks the context -> 500 `ai.context_blocked` (PT-BR detail: the assessment was not generated, to protect account data);
   - the analyst question plus the alert summary exceeds the 2000-character limit of the legal chat -> 422 `ai.question_too_long`;
   - keep 422 `ai.alert_context_mismatch` when the body's `context.alert_id` differs from the path id;
   - do not use `ai.generation_failed`.
5. Placement (api/AGENTS.md: "LLM e RAG ficam em src/fraudradar/ai; a rota só chama"):
   - Move the LLM-facing logic out of api/ into a new module src/fraudradar/ai/alert_assessment.py. That covers alert context construction and redaction, the identifier guard, the prompt texts, the typology vocabulary and the parsing of the suggested typology. Use pure functions over plain values; the module must not import from `api.*`.
   - api/ keeps the database reads (preparing the data with api.repositories), the persistence (api/repositories/alert_assessments.py) and the routes.
   - Update or move Victor's tests to match (tests/test_alert_ai_context.py, tests/test_alert_ai_service.py, tests/test_alert_assessment_http.py, tests/test_alert_assessment_rag_contract.py, tests/test_alert_assessments.py, tests/test_alert_chat_http.py, tests/api/test_base.py). Keep their intent; delete only what no longer applies.
6. Retrieval query: `answer_legal_chat` (api/legal_chat_service.py) searches the legal base with the whole question. For alerts, that question is a ~2000-character prompt full of JSON. Add an optional keyword argument `retrieval_query: str | None = None` and use it for the legal search. When it is None, use the question itself, so POST /chat behaves as before. For the assessment, use a short fixed PT-BR legal query about the duty to monitor and report suspicious operations to COAF and about money-laundering indications. For the alert chat, use the sanitized analyst question.
7. Suggested typology. The model does not predict typology; the plan is that it comes from the AI assessment.
   - The assessment prompt asks the LLM to end with one line `Tipologia sugerida: <code>`, where `<code>` is one of the 17 SAML-D suspicious typology codes or `indefinida`:
     behavioural_change_1, behavioural_change_2, bipartite, cash_withdrawal, cycle, deposit_send, fan_in, fan_out, gather_scatter, layered_fan_in, layered_fan_out, over_invoicing, scatter_gather, single_large, smurfing, stacked_bipartite, structuring.
   - Parse that line strictly: case-insensitive, whitespace-tolerant, exact code only. Remove it from the stored content.
   - Store the code in `assessments.suggested_typology`. In the same write transaction, set `alerts.typology` to the PT-BR display label and `alerts.updated_at = now()`. Keep the vocabulary in one dict in src/fraudradar/ai/alert_assessment.py:
     structuring "Estruturação", smurfing "Smurfing", cash_withdrawal "Saque em espécie", deposit_send "Depósito e envio", fan_out "Fan-out", fan_in "Fan-in", layered_fan_out "Fan-out em camadas", layered_fan_in "Fan-in em camadas", bipartite "Bipartido", stacked_bipartite "Bipartido empilhado", gather_scatter "Concentração e dispersão", scatter_gather "Dispersão e concentração", cycle "Ciclo", single_large "Transação única de alto valor", over_invoicing "Superfaturamento", behavioural_change_1 "Mudança de comportamento 1", behavioural_change_2 "Mudança de comportamento 2".
   - A missing or invalid code, or `indefinida`, leaves `suggested_typology` NULL and `alerts.typology` untouched.
   - The typology never comes from `ground_truth`.
8. Audit: generating an assessment changes state, so write `audit_log` in the same write transaction:
   - action `assessment_generated`, entity `alert`, actor = the current user's name;
   - details with assessment_id, llm_model, suggested_typology and user_id.
   The route takes `user: CurrentUser` (api.dependencies). Reuse the helper pattern of `_audit` in api/repositories/decisions.py; move it to a shared place if two modules need it.
9. Translations: every code the API raises must have text in web/messages/pt-BR/errors.json and web/messages/en/errors.json (see how `ai.not_configured` was added). Add `ai.invalid_assessment`, `ai.alert_context_mismatch`, `ai.context_blocked` and `ai.question_too_long`. Do not remove texts of codes that are still raised. web/tests/i18n-server-codes.test.ts must pass.
10. Quality:
    - comments and docstrings of the AI files you touch in PT-BR;
    - new or changed `detail` messages in correct PT-BR;
    - no imports inside functions unless a test must patch them;
    - update the module docstring of api/routes/ai.py;
    - `uv run ruff check .` and `uv run ruff format --check .` clean.

## Verify (all must pass; report the exact numbers)
- `uv run ruff check .` and `uv run ruff format --check .`. Use `uv run` (never `uv sync`: the venv already has every group).
- `uv run pytest` against Postgres, with these environment variables set: TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:55433/fraudradar_codex_test and REQUIRE_TEST_DB=1. The server is already running, and the test fixture creates and drops that database. Do not start or stop Docker containers.
- `cd web && pnpm test` (dependencies are installed).
- Tests stay offline: never call the real Gemini API.

## Final report (in English)
- files changed, added and removed;
- the final list of error codes the AI routes can return, with HTTP status;
- how the identifier matching works;
- verification results with numbers;
- anything you could not do, and decisions that need a human (product decisions go in the report; do not invent them).
````


## Segunda mensagem, na mesma sessão (revisão do Claude)

````text
Review follow-up on your changes in C:\codigo\pessoal\fraudradar (same branch, same rules: no git commands that change state, no Docker commands, no real Gemini calls, do not touch docs/vibe-coding/prompts/). Good work overall. Apply these seven fixes, then re-run every verification.

1. Forbidden identifiers: keep only account numbers, meaning the alert account plus the movement sender and receiver. Drop transaction ids from `_forbidden_identifiers`. They are internal row ids, not account numbers. Datasets created through the API start their ids at 1, so a movement id such as 19 or 2023 would collide with the date "2023-06-19" in the context and block the assessment with 500 `ai.context_blocked`. Add a regression test where the movements have small ids (2, 19, 2023) and the context has the week 2023-06-19: it must not be blocked. Update docstrings and tests that mention transaction ids.

2. Assessment retrieval query. I measured it against the real legal base (rag-load of Lei 9.613, real e5 embeddings):
   - the current `ASSESSMENT_RETRIEVAL_QUERY` returns Art. 11, 14, 15 (14 and 15 describe COAF's own duties);
   - the following text returns Art. 11, 10, 10 (the institutions' duties: identify clients, keep records, special attention to suspicious operations, report to COAF). Use it exactly:
     "deveres das instituições financeiras: identificar clientes, manter registro das operações, dispensar especial atenção a operações suspeitas e comunicá-las ao COAF"

3. Typology line parser: stay strict about the code, but tolerate how Gemini formats the line. It must still be the last non-empty line.
   - Accept optional list or markdown prefixes (`-`, `*`, `>`, `#`), bold or italic markers around the label (`**Tipologia sugerida:**`, `**Tipologia sugerida**:`), the code wrapped in backticks, quotes or `**`, and one trailing period.
   - The code itself must be exactly one of the 17 codes or `indefinida` (case-insensitive).
   - An invalid code (e.g. `fan-out` with a hyphen) gives `suggested_typology=None`, and the line is still removed from the content.
   - Add tests for `**Tipologia sugerida:** fan_out`, ``Tipologia sugerida: `fan_out`.``, `- Tipologia sugerida: FAN_OUT`, and the invalid hyphen case.

4. Do not send the alert's current typology to the LLM. Remove `typology` from the context and from the financial summary. `alerts.typology` only ever comes from a previous AI suggestion, so sending it back would anchor the next assessment on the previous one. Update tests.

5. Gemini outage during an assessment. When Gemini answers 503, `generate_from_prepared_evidence` returns status `llm_unavailable`, and the adapter (src/fraudradar/ai/legal_chat_adapter.py) returns a fixed fallback answer with the sources. Today the assessment rejects that text through `_FALLBACK_MARKERS` and answers 502 `ai.invalid_assessment`. It should answer 503 `ai.provider_unavailable`.
   - Export the fallback text as a module constant (e.g. `LLM_UNAVAILABLE_ANSWER`) in legal_chat_adapter.py and use it there.
   - In the assessment route, compare `generated.answer == LLM_UNAVAILABLE_ANSWER` (equality with the shared constant, no substring matching) and raise 503 `ai.provider_unavailable` before validation.
   - The alert chat keeps returning the fallback with the sources, as today.
   - Add an HTTP test for the assessment case.

6. In both alert routes, catch only `AlertContextBlockedError` (500 `ai.context_blocked`) and `AlertQuestionTooLongError` (422 `ai.question_too_long`). Do not catch generic `ValueError` or `TypeError`: a real bug must not be reported to the analyst as "blocked to protect account data".

7. `ai.not_configured` is now also raised by the alert routes, so make its text general.
   - API detail (PT-BR): "A IA não está configurada na API (defina LLM_MODEL e a chave do Gemini)."
   - web/messages/pt-BR/errors.json: the same text.
   - web/messages/en/errors.json: "AI is not configured on the API (set LLM_MODEL and the Gemini key)."
   - Update the tests that assert the old text.

Verify again and report the numbers:
- `uv run ruff check .` and `uv run ruff format --check .`
- `uv run pytest` with TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:55433/fraudradar_codex_test and REQUIRE_TEST_DB=1
- `cd web && pnpm test`

Final report (English): what changed per item, files touched, verification numbers.
````

## Terceira mensagem, na mesma sessão (rascunho ao COAF em texto simples, do pedido 126)

````text
Third follow-up in C:\codigo\pessoal\fraudradar (same branch, same rules: no git commands that change state, no Docker commands, no real Gemini calls, do not touch docs/vibe-coding/prompts/ and do not touch web/src/: a parallel task is changing how the front renders Markdown).

The assessment content is Markdown written by Gemini: bold, headings, `*`/`-`/`+` lists, numbered lists, inline code, links and citation markers such as `[F1]`. The front will render it. But the COAF report draft copies the latest assessment into a plain-text communication (`build_report_draft` in api/repositories/decisions.py), and the analyst edits and approves that communication in a textarea. The Markdown symbols end up in the communication.

1. Add a pure function in src/fraudradar/ai/alert_assessment.py, e.g. `assessment_plain_text(content: str) -> str`, that converts that Markdown to clean plain text:
   - remove emphasis markers (`**x**`, `__x__`, `*x*`, `_x_`), but never touch underscores inside words such as `fan_out` or `layered_fan_in`;
   - remove backticks and blockquote markers;
   - drop heading markers and keep the heading text on its own line;
   - turn `*`, `+` and `•` bullets into `- `, keeping one level of indentation;
   - keep numbered lists, line breaks, paragraph breaks and the `[F1]` markers;
   - turn `[text](https://url)` into `text (https://url)`;
   - drop horizontal rules (`---`, `***`);
   - collapse three or more consecutive newlines into one blank line.
2. Use it in `build_report_draft` for the "Parecer mais recente" section only. The stored assessment keeps its Markdown.
3. Tests for the function, plus a draft test: a draft built from a Markdown assessment contains no `**`, no `#` heading markers and no `* ` bullets, and keeps `[F1]` and `fan_out`.

Verify again and report the numbers:
- `uv run ruff check .` and `uv run ruff format --check .`
- `uv run pytest` with TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:55433/fraudradar_codex_test and REQUIRE_TEST_DB=1
- `cd web && pnpm test`

Final report (English): files touched, rules implemented, verification numbers.
````

Resultado: `122-codex2-parecer-result.md`.
