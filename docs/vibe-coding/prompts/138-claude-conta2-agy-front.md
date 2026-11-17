---
id: 138
area: frontend
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 137
data: 2026-11-17
---

# Delegação ao agy: navegação sem recarga, paginação, modal do parecer e fontes do chat

Prompt enviado, na íntegra, na branch `feat/web-smooth-nav-ai-report`:

````text
Repository: FraudRadar (C:\codigo\pessoal\fraudradar), branch `feat/web-smooth-nav-ai-report` (already checked out). You own ONLY files under web/ (except web/API_CONTRACTS.md, which another agent edits). Another agent (Codex) is editing Python files (src/, api/, tests/) at the same time: do not touch them. Read AGENTS.md and web/AGENTS.md first (layers component -> hook -> service -> API, components never fetch; identifiers in English; comments in Brazilian Portuguese; every new screen text goes into BOTH web/messages/pt-BR/<module>.json and web/messages/en/<module>.json; visual rules in web/DESIGN.md: theme tokens only, never fixed colors; notifications only via `notify`). This Next.js version differs from your training data: read node_modules/next/dist/docs/ before using any Next API. Do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add; leave every change in the working tree for review. Do not start or stop Docker containers. Do not edit docs/vibe-coding/prompts/. No new npm dependencies (use @base-ui/react, already installed, for the dialog, and lucide-react for icons).

## 1. Home page and sidebar order
Today the app opens on /accounts and the sidebar lists Accounts before Dashboard. The product owner wants the Dashboard as the home screen.
- web/src/app/page.tsx, web/src/proxy.ts (post-login / root redirect), web/src/features/auth/hooks/use-auth.ts (`router.replace("/accounts")`) and the brand link in web/src/components/layout/sidebar.tsx: point to "/dashboard".
- web/src/lib/sidebar.ts SIDEBAR_NAV_GROUPS "analysis" group order: dashboard, alerts, accounts.
- Update web/tests/sidebar.test.ts and any test asserting the old home.

## 2. No full-screen "loading" swap when data refetches (root cause of several complaints)
web/src/hooks/use-resource.ts returns `loading: true` and `data: undefined` whenever the loader identity changes (filter, page, week, the global `revision` from app-context `refresh()`) and also on `reload()`. Every screen then replaces its whole content with <LoadingState />. Effects the user sees: changing table page makes the table vanish and reappear and the browser jumps to the top (page height collapses); changing the week on /dashboard looks like a full page reload; generating the AI assessment on /alerts/[id] (use-alerts.ts runAction calls `refresh()` + `resource.reload()`) swaps the whole alert page for the spinner.
Fix it at the root:
- useResource keeps the last successful data while a new request is in flight (stale-while-revalidate). Return `{ data, error, loading, refreshing, reload }`: `loading` is true only when there is nothing to show yet (first load); `refreshing` is true while a refetch runs with previous data still visible. `reload()` never clears data.
- Accept an optional second argument `{ resetKey?: unknown }`: when `resetKey` changes, previous data IS discarded (first-load behaviour). Use it where showing the previous entity would be wrong, e.g. the alert detail keyed by alert id (navigating alert 12 -> alert 13 must not show alert 12). List filters, pagination and week changes keep the previous data visible.
- A late response for an older loader must never overwrite the newer one (keep the AbortController logic).
- While `refreshing`, the affected region (table panel, dashboard cards) stays mounted, gets `aria-busy="true"`, a subtle opacity dim (e.g. opacity-60 with a 150ms transition, `motion-reduce:transition-none`) and pointer-events-none on the rows; optionally a thin indeterminate bar at the top of the panel using theme tokens. No layout shift, no scroll jump, no window.scrollTo.
- Review ALL callers of useResource (grep the 10 files) and adapt them; the week picker (web/src/features/alerts/components/week-picker.tsx) and the dashboard must switch weeks without the full LoadingState.
- Errors during a refetch: show the error via the existing ResourceError only if there is no data; otherwise keep the data and notify.error once.

## 3. Pagination with page numbers
Tables only have "Anterior" / "Próxima" buttons (web/src/features/alerts/components/alert-queue.tsx, web/src/features/accounts/components/suspicious-accounts.tsx; grep for other paginated lists and include them).
- Create a reusable web/src/components/ui/pagination.tsx: previous / next buttons, numbered pages with ellipsis (always first and last, current ±1; e.g. `1 … 4 5 6 … 20`), current page with aria-current="page", and a small "Ir para" number input (Enter or blur jumps; clamp to 1..totalPages; invalid input reverts). Wrapped in <nav aria-label=...>. Compact on narrow screens (hide the far numbers, keep prev/current/next and the input). Keyboard accessible, min touch target 36px, theme tokens only.
- Put the page-number algorithm in a pure function (e.g. `getPageItems(current, totalPages)` in web/src/lib/pagination.ts) and test it in web/tests/pagination.test.ts (node:test, like the other tests): 1 page, 7 pages, first/last/middle of 20 pages, current out of range.
- Use it in every paginated table. Changing page keeps the table mounted (item 2) and does NOT scroll the window.

## 4. AI assessment card on /alerts/[id] (web/src/features/alerts/components/alert-detail.tsx)
Problems: the generated assessment is huge, the text overflows horizontally out of its card (long words/URLs and the card hint "rascunho para revisão" push past the border), and the full legal-source excerpts ("[F1] Art. 11 - Fonte juridica · Art. 11. As pessoas ... Fonte oficial: https://...") are dumped under it.
New behaviour:
- The API's Assessment object gains `summary: string` (2-3 sentences; added by the backend agent in parallel). Add it to the alerts zod schema as optional and, when missing (old data / mocks), derive a fallback on the client with a pure helper (the text of a "## Resumo" section if present, otherwise the first paragraph, cut at a sentence boundary near 300 chars). Test the helper.
- The card shows only the summary (Markdown component), a line like "3 fontes jurídicas citadas", a primary button "Ver parecer completo" and the existing generate/regenerate button. Generating keeps the card and page visible; the button shows a spinner/"Gerando..." state.
- "Ver parecer completo" opens a centered modal (Base UI Dialog from @base-ui/react; create web/src/components/ui/dialog.tsx if there is none) with backdrop, focus trap, Esc/close button, max-w-3xl, max-h-[85vh] with the body scrolling inside. Make it EXTREMELY well structured and readable:
  - Header: title "Parecer da IA — Alerta #<id>", badges: "Rascunho para revisão", score, week, suggested typology label when present.
  - Body: the full `content` rendered with the Markdown component with document typography (clear spacing between sections, headings with hierarchy, comfortable line length ~70ch, lists indented). The backend now writes sections "## Resumo", "## Sinais de risco", "## Contexto transacional", "## Fundamentação jurídica", "## Limitações", "## Próximos passos sugeridos".
  - "Fontes jurídicas" section at the end: one collapsible item per source (title like "[F1] Art. 11", excerpt hidden until expanded, and an "Abrir fonte oficial" link taken from the "Fonte oficial: https://..." line of the excerpt; https only, target _blank rel noopener noreferrer). Strip that URL line from the shown excerpt.
  - Footer: "Baixar (.md)" downloads `parecer-alerta-<id>.md` (content + a "Fontes" section) via a Blob, and "Imprimir / PDF" calls window.print() with print CSS that prints only the dialog content (hide the rest of the app with @media print). Footer note: "Rascunho gerado por IA; não substitui a análise do analista."
- Fix overflow globally in web/src/components/markdown.tsx (root `min-w-0 break-words [overflow-wrap:anywhere]`) and in the card/CardTitle (hint wraps under the title instead of overflowing; card `min-w-0`).
- Update the mock assessment in web/src/features/alerts/services/alerts-service.ts to include `summary` and the new section structure, so demo mode shows it.

## 5. Assistant chat (web/src/features/assistant/components/assistant.tsx, both render paths ~line 89 and ~line 298)
Today every answer is followed by the full text of every legal source. Instead:
- No sources -> show nothing (the backend will now answer greetings without sources).
- With sources -> a collapsed disclosure "Fontes (N)" under the answer; expanding lists each source title with its "Abrir fonte oficial" link and the excerpt (URL line stripped). Reuse the same source-item component as the modal (put it in a shared place, e.g. web/src/features/alerts/components/legal-source-item.tsx or web/src/components/).
- Same overflow fix (min-w-0, overflow-wrap anywhere) in chat bubbles.

## 6. Done when
- All new text in both message files; `tests/i18n-messages.test.ts` passes.
- From web/: `pnpm lint`, `pnpm test`, `pnpm build` all pass (if build fails with TS2307 in .next/dev/types, delete web/.next and web/.next-test and retry; if pnpm test cannot resolve next-intl, run `CI=true pnpm install --frozen-lockfile`).
- Final report in English: files changed, what each change does, test/lint/build output summary, and anything you could not do or decided differently.
````
