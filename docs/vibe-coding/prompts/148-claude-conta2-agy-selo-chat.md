---
id: 148
area: frontend
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 146
data: 2026-11-17
---

# Delegação ao agy: selo do tipo de resposta no assistente

Prompt enviado, na íntegra, na branch `feat/ai-chat-router`:

````text
Repository: FraudRadar (C:\codigo\pessoal\fraudradar), branch `feat/ai-chat-router` (already checked out). You own ONLY files under web/ except web/API_CONTRACTS.md. Another agent (Codex) is changing Python files in parallel: do not touch src/, api/, tests/. Read AGENTS.md and web/AGENTS.md first (component -> hook -> service -> API; identifiers in English; comments in PT-BR; every new screen text in BOTH web/messages/pt-BR/<module>.json and web/messages/en/<module>.json; theme tokens only, web/DESIGN.md). Do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add. Do not start/stop Docker. Do not edit docs/vibe-coding/prompts/. No new npm dependencies.

## Contract change (being implemented in the API now)
The chat response (`POST /chat` and `POST /alerts/{id}/chat`) gains `kind: "small_talk" | "legal" | "domain" | "out_of_scope"`:
- `legal`: answer based on the Lei 9.613/1998 with cited sources ([F1]...), sources list non-empty.
- `domain`: general explanation of AML/fraud concepts (e.g. typologies), no legal sources, sources = [].
- `small_talk` and `out_of_scope`: short fixed replies, sources = [].

## Tasks
1. Add `kind` to the chat response zod schema in web/src/features/assistant (schemas/services). Make it optional (older API may omit it): when absent, treat as `legal` if sources is non-empty; if absent and sources is empty, show no badge at all. Update mocks (NEXT_PUBLIC_USE_MOCKS) so demo mode returns examples of each kind (a greeting -> small_talk; "o que é fan-out" -> domain; anything mentioning "lei"/"art." -> legal with a source; "titanic" or unrelated -> out_of_scope).
2. In web/src/features/assistant/components/assistant.tsx (both render paths), show a small, discreet badge under assistant answers:
   - legal: "Com base na Lei 9.613/1998" (keep the existing collapsed "Fontes (N)" disclosure);
   - domain: "Resposta geral, sem fonte jurídica" with a title/tooltip "Explicação de conceito; para obrigações legais, pergunte o que a lei exige.";
   - small_talk / out_of_scope: no badge.
   Use the existing Badge component/theme tokens; muted styling, not alarming.
3. Update the assistant's empty-state/example prompts (if any) to show one example of each useful kind, e.g. "O que é a tipologia fan-out?", "O que a lei exige ao comunicar ao COAF?", "O que verificar primeiro neste alerta?" (alert page only).
4. Tests (node:test in web/tests): schema accepts each kind and a response without kind; the badge-label helper (pure function) returns the right key per kind.

## Done when
From web/: `pnpm lint`, `pnpm test`, `pnpm build` pass (TS2307 in .next/dev/types -> delete web/.next and web/.next-test and retry). Final report in English: files changed, behaviour, test/lint/build summary.
````
