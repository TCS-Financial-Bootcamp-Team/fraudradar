---
id: 109
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Claude Code (conta 2, do Pedro)
pai: 108
data: 2026-11-13
---

# Delegação: alternar o idioma do front entre português e inglês

## Prompts do Pedro

> planeja ai um botão que permita alternar o idioma do frontend para ingles ou portugues

> coloque o claude 2 pra trabalhar nessa nova funcionalidade de mudança de idioma, alem disso, verifique oque foi feito pelo claude do vinicius, em relação a ultima solicitação que fizemos

## Plano (resposta do Claude à primeira mensagem, resumo)

Nota 6/10, precisa de ajuste: o botão é fácil; o trabalho está nos ~580 textos em 75 arquivos do
front e nos textos que a API e o worker mandam prontos em português (`detail` dos erros, mensagens
dos trabalhos, motivo de bloqueio do retreino, trava de promoção, sugestão de compatibilidade,
nomes das semanas). Proposta: `next-intl` sem idioma na URL, cookie `NEXT_LOCALE`, mensagens por
módulo, PT-BR como padrão e origem; etapa 1 no front, etapa 2 com `code` + `params` nas mensagens
do servidor. A comunicação ao COAF fica sempre em português.

## Decisões

- O Pedro não escolheu entre só a etapa 1 ou as duas; o Claude seguiu a própria recomendação
  (as duas), porque sem a etapa 2 o modo inglês mostra português nos fluxos novos.
- Base: `origin/feat/analyst-feedback` (branch `feat/i18n`), porque o retorno dos analistas mexe
  nas mesmas telas e ainda não foi para a `main`; traduzir em cima da `main` geraria conflito.

Prompt entregue ao Claude conta 2 (Sonnet), na íntegra:

````text
You are working in the FraudRadar PLD repository, in the git worktree C:\codigo\pessoal\fr-wt-i18n, branch feat/i18n (based on origin/feat/analyst-feedback, which is not merged yet). Implement a language switch for the web app: Brazilian Portuguese (default) and English. You run non-interactively: do not ask questions; when something is not specified, take the simplest option consistent with this design and list it in your final report.

Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/DESIGN.md, api/AGENTS.md, docs/glossary.md. Code identifiers in English; comments/docs in Portuguese. Commit after each step (so partial work survives), but do NOT push, open a PR or merge. Do NOT touch docs/vibe-coding/prompts/ except to create the result file below. Never print or commit secrets (.env). Tests only in databases ending in `_test`.

## Goal and scope

- A visible "PT | EN" switch: in the header next to the theme toggle (src/components/theme-toggle.tsx, src/components/layout/header.tsx), on the login/sign-up screens (src/app/(auth)), and in Configurações > Aparência. It sets a cookie `NEXT_LOCALE` (1 year, path /, SameSite=Lax) and refreshes, so the server renders the right language: `<html lang>` in src/app/layout.tsx follows it (today hard-coded "pt-BR"), no flash on load. Default and fallback: pt-BR (cookie missing or invalid). No locale in the URL.
- Everything the user reads in the web app is translated: labels, buttons, headings, empty/loading/error states, tooltips, aria-labels, toasts (src/lib/notify.ts and callers), confirmation dialogs, chart axes/legends/aria text, zod validation messages, page titles/metadata, and the fallbacks in src/lib/api.ts and src/lib/format.ts.
- Number, percent, currency and date formatting follow the locale (src/lib/format.ts hard-codes "pt-BR"; currency stays GBP).
- NOT translated: user-typed content (justifications, notes), data values (accounts, countries, payment types and typology codes as data, SAML-D values), the COAF report draft text (a Brazilian regulatory document: always Portuguese; in English mode label it "COAF report (in Portuguese)"), the LLM assessment/chat content, server logs.

## Step 1 — infrastructure

- Use `next-intl` in its "without i18n routing" mode (locale from the cookie in the request config, `NextIntlClientProvider` in the root layout, `useTranslations`/`getTranslations`, `useFormatter` or a locale-aware wrapper). First check that the current next-intl release supports Next 16.4 + React 19.3 (package.json); if it does not, write a minimal typed in-house equivalent with the same shape (provider + `useT(namespace)` + ICU-like interpolation and plural) and say so in the report. Pin an exact version that is at least two weeks old.
- Messages: one JSON file per module and language, `web/messages/pt-BR/<module>.json` and `web/messages/en/<module>.json` (modules: common, shell, auth, accounts, alerts, assistant, datasets, health, ingestion, jobs, models, processing, settings, errors). pt-BR is the source: type the keys from the pt-BR files so a missing or misspelled key fails `pnpm build`.
- Add a test (node:test, like the existing web tests in web/scripts/run-tests.mjs) that fails when a key exists in one language and not in the other, or when an ICU placeholder differs between them.
- Keep the existing web tests in Portuguese (default locale); add a small test helper/provider if components now need the intl context.

## Step 2 — the switch

As described in the scope. The control is accessible (button group or select with a label, keyboard, `aria-pressed`/`aria-current`), uses theme tokens from web/DESIGN.md (no hard-coded colors), and works at phone width.

## Step 3 — translate the screens, module by module

Replace the hard-coded strings in web/src (≈580 strings in ≈75 files; find them with a grep for Portuguese accents and capitalized strings) with keys. One commit per module or group of modules. English wording: plain, professional, AML vocabulary. Add an "EN" column to docs/glossary.md and use it consistently, e.g. PLD → AML; Contas suspeitas → Suspicious accounts; Fila → Queue; Alerta → Alert; Arquivar → Archive; Aprofundar → Escalate; Comunicar ao COAF → Report to COAF; Falso positivo confirmado → Confirmed false positive; Sem evidência suficiente → Insufficient evidence; Amostra de controle → Control sample; Precisão confirmada → Confirmed precision; Retorno dos analistas → Analyst feedback; Trava de promoção → Promotion gate; Conjunto de dados → Dataset; Fontes de dados → Data sources; Processar agora → Process now; Simular novas transações → Simulate new transactions; Tipologia → Typology. Keep "COAF" as is (the Brazilian FIU).

## Step 4 — server messages (API and worker)

Messages built in Portuguese on the server must be translatable on the client, without breaking the current clients:
- API errors: introduce one error type (e.g. `AppError(status, code, message, params)`) with a handler that returns `{"detail": "<Portuguese text, as today>", "code": "<stable.code>", "params": {...}}`. Convert the errors that reach the screens (at least: retraining block reasons from src/fraudradar/model/eligibility.py, the promotion gate, feedback refusals, dataset/connection/import/simulation/ingestion validation errors, decision validation, not-found/conflict messages of the main routes). Errors not converted keep returning only `detail`. src/lib/api.ts: translate by `code` with `params` when the key exists; otherwise show `detail` (Portuguese) as today.
- Jobs (`public.jobs`): add `message_code TEXT` and `message_params JSONB` next to the current message (db/init/003_platform.sql plus an idempotent `db/upgrades/007_i18n.sql` for existing volumes, documented in README next to 006). The worker fills them for the final and progress messages shown in the front (process, simulate, import, train, labels); the front translates by code and falls back to the Portuguese text.
- The model card's promotion gate reason and the compatibility report suggestion (src/fraudradar/sources/compatibility.py `suggest`) also carry `code` + `params` next to the text; the API exposes them; the front translates.
- Week labels: wherever the API sends a pre-formatted label (`week_label` in api/repositories/monitoring.py and similar), also send the ISO date and let the front format it by locale. Keep the old field for compatibility.
- Tests: the error handler shape, each converted message has a code, the jobs columns are filled, `007` applied twice is idempotent (on a scratch `_test` database), and the front falls back to `detail` for an unknown code.

## Step 5 — docs

- web/AGENTS.md and AGENTS.md: the rule "textos de tela em PT-BR" becomes "PT-BR é o idioma padrão e a fonte das traduções; todo texto de tela novo entra nos dois arquivos de mensagens (pt-BR e en)"; how to add a key; what is never translated.
- api/AGENTS.md: new screen-facing messages use `AppError` with a code; worker messages shown on screen carry `message_code`.
- .agents/skills/fraudradar-overview/SKILL.md (keep the .claude/skills copy identical): the language switch and the messages layout.

## Verification (report exact numbers; 0 skipped)

- `uv run ruff check . && uv run ruff format --check .`
- `TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_i18n_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest` (start the database with `docker compose up -d db` if needed; do not stop or recreate containers or volumes).
- `cd web && pnpm install && pnpm lint && pnpm test && pnpm build`
- A grep proving no Portuguese UI string is left in web/src outside messages/, tests, mocks data and comments (list any intentional leftovers and why).

## Delivery

- Commits on feat/i18n following CONTRIBUTING.md (one scope per commit, Portuguese, imperative, lowercase, ≤ 72 chars), each with the footer:
  Prompt: 110
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
- Register your result in docs/vibe-coding/prompts/110-claude-conta2-i18n-result.md (front matter: id 110, area frontend, autor Claude Code (conta 2, do Pedro), destino Pedro, pai 109, data, tipo resposta, modelo): what changed, verification commands and numbers, decisions you took, intentional leftovers, what is still open, in Portuguese. Commit it in a `docs:` commit.
- Final report in Portuguese: commits, test numbers, anything not verified, decisions you took.
````
