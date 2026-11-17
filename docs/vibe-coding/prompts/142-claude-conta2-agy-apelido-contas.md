---
id: 142
area: frontend
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 137
data: 2026-11-17
---

# Delegação ao agy: apelido fictício das contas

O Pedro aprovou no chat o apelido proposto pela IA ("gostei da ideia do apelido, seguiremos com isso") e mandou a chave do Gemini para testar a IA localmente (a chave foi para o `.env`, fora do git, e não entra neste registro). Prompt enviado, na íntegra:

````text
Repository: FraudRadar (C:\codigo\pessoal\fraudradar), branch `feat/web-smooth-nav-ai-report` (already checked out, with uncommitted work from earlier today: keep it). You own ONLY files under web/ (not web/API_CONTRACTS.md). Read AGENTS.md and web/AGENTS.md first (component -> hook -> service -> API; identifiers in English; comments in Brazilian Portuguese; every new screen text goes into BOTH web/messages/pt-BR/<module>.json and web/messages/en/<module>.json; visual rules in web/DESIGN.md, theme tokens only). Do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add. Do not start/stop Docker. Do not edit docs/vibe-coding/prompts/. No new npm dependencies.

## Goal: account aliases (display-only reading aid)
Accounts are identified only by long numbers, which are hard for the analyst to tell apart. The product owner approved showing a deterministic, fictitious alias NEXT TO the account number (never replacing it).

Rules (all mandatory):
1. Pure function `accountAlias(account: string | number): string` in web/src/lib/account-alias.ts. Deterministic: the same account always gets the same alias, on every screen, browser and session (no storage, no randomness, no Date). Use a simple stable hash of the decimal string (e.g. FNV-1a 32-bit) to pick the parts.
2. The alias must NOT look like a real person: no first names or surnames. Format: an animal noun + an invariant colour/material noun + a 2-character uppercase base-36 suffix, e.g. "Falcão Âmbar 7Q", "Lontra Índigo K2". Write ~40 animals (PT-BR, no offensive or ambiguous ones) and ~32 invariant colour/material nouns (Âmbar, Índigo, Cobalto, Jade, Ônix, Coral, Grafite, Safira, Cobre, Bronze, Marfim, Ocre, Musgo, Turquesa, ...). These are data, not UI text: the alias stays the same in PT-BR and EN mode (do not translate).
3. Display only. The alias is never sent to the API (no request body, query string, header, chat context or assessment request), never goes into the COAF report draft/approval text, the decision justification, CSV/Markdown downloads, or anything the LLM receives. Grep the services and the assistant's context builder to confirm and keep it that way.
4. Where to show it: every place an account number is shown to the analyst — alert queue table, suspicious accounts table, alert detail header and its "other weeks of this account" card, account graph node labels/tooltips (keep it short there; e.g. alias on the label, number in the tooltip, or the reverse if space is tight), dashboard top lists if any, and the account page. Layout: alias as the primary readable label (font-medium) with the number beneath or beside it in muted mono text; search by account number keeps working exactly as before. Make it a small reusable component, e.g. web/src/components/account-label.tsx (`<AccountLabel account={...} />`), with a `title`/tooltip: "Apelido fictício gerado a partir do número da conta, só para facilitar a leitura. Não é um nome real." (both message files).
5. Do not break table column widths or overflow; it must look clean at narrow widths.

## Tests
web/tests/account-alias.test.ts (node:test): deterministic (same input twice, string vs number input give the same alias); format matches /^\p{Lu}[\p{L}]+ [\p{Lu}][\p{L}]+ [0-9A-Z]{2}$/u; different accounts usually differ (e.g. 1000 sequential accounts produce at least 990 distinct aliases); none of the parts is in a small list of common Brazilian first names you write in the test (Maria, José, Ana, João, ...).

## Done when
From web/: `pnpm lint`, `pnpm test` and `pnpm build` pass (if build fails with TS2307 in .next/dev/types, delete web/.next and web/.next-test and retry). Final report in English: files changed, every place the alias appears, how you confirmed it never reaches the API, test/lint/build summary.
````
