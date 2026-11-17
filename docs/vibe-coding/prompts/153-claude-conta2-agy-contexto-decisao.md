---
id: 153
area: frontend
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 151
data: 2026-11-17
---

# Delegação ao agy: controle do contexto da página e selo de apoio à decisão

Prompt enviado, na íntegra, na branch `feat/ai-alert-decision-support`:

````text
Repository: FraudRadar (C:\codigo\pessoal\fraudradar), branch `feat/ai-alert-decision-support` (already checked out). You own ONLY files under web/ except web/API_CONTRACTS.md. Codex is changing Python files in parallel: do not touch src/, api/, tests/. Read AGENTS.md and web/AGENTS.md first (component -> hook -> service -> API; identifiers in English; comments in PT-BR; every new screen text in BOTH web/messages/pt-BR/<module>.json and web/messages/en/<module>.json; theme tokens only, web/DESIGN.md). Do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add. Do not start/stop Docker. Do not edit docs/vibe-coding/prompts/. No new npm dependencies.

## Context
web/src/features/assistant: on /alerts/{id} the AssistantDrawer (assistant.tsx, getAlertIdFromPathname) already sends questions to POST /alerts/{id}/chat with context.alert_id and shows a chip "alertContext". The API is gaining (in parallel) a new answer kind `decision` (in addition to small_talk, legal, domain, out_of_scope) for questions like "isso é lavagem de verdade?", with a Markdown answer in five sections: "Indícios a favor", "Indícios contra", "O que falta verificar", "Força dos indícios: fraca|moderada|forte", "Leitura sugerida" (arquivar/aprofundar/comunicar, a suggestion). The API now also uses the last 6 messages of `history` (already sent by the front — verify use-assistant.ts sends it; if not, send the last 6 {role, content}).

## Tasks
1. Context sharing control: make the alert-context chip in the drawer explicit and controllable — label "Contexto: Alerta #<id>" with an icon, and a toggle (switch or small button "Não usar o contexto desta página"/"Usar contexto") that, when off, sends the question to the general POST /chat without alert_id (the service already picks the path by alert_id). Default ON on alert pages. Remember the choice per tab session only (sessionStorage, wrapped in try/catch; no localStorage). When the user navigates to another alert, keep the preference but update the id. Tooltip: "A IA recebe os dados deste alerta sem números de conta."
2. Also show the chip/toggle in the alert page's own chat if the page embeds `<Chat alertId=...>` (check alert-detail.tsx; the drawer is the main one).
3. Suggestions on alert pages (getSuggestionKeys): "Isso parece lavagem de verdade?", "O que pesa contra este alerta?", "O que falta verificar antes de decidir?", keep "O que a lei exige ao comunicar ao COAF?". On other pages keep the current ones.
4. kind `decision`: add to the zod enum (keep optional kind). Badge: "Apoio à decisão — a decisão é sua" (muted, with tooltip "Sugestão baseada nos dados do alerta; não registra decisão."). Render the Markdown as today; if the answer contains a line "Força dos indícios: fraca|moderada|forte", additionally show a small strength pill (fraca = neutral, moderada = warning token, forte = danger token; use theme tokens, never fixed colors) — parse with a pure helper and test it. Do not hide the text line.
5. Mocks (NEXT_PUBLIC_USE_MOCKS): a decision-question example returns a `decision` answer in the five-section format.
6. Tests (node:test, web/tests): schema accepts `decision`; strength parser (accents/case, absent -> null); suggestions per page; toggle off -> request without alert_id (test the pure function that builds the request/context if you extract one).

## Done when
From web/: `pnpm lint`, `pnpm test`, `pnpm build` pass (TS2307 in .next/dev/types -> delete web/.next and web/.next-test and retry). Final report in English: files changed, behaviour, test/lint/build summary.
````
