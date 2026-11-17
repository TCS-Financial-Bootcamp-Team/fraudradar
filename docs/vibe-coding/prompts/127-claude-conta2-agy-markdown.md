---
id: 127
area: frontend
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 126
data: 2026-11-17
---

# Delegação ao agy: markdown do parecer e do assistente

Prompt enviado, na íntegra, numa worktree da `main` (branch `fix/web-ai-markdown`):

````text
Repository: FraudRadar. Work only in the git worktree at C:\codigo\pessoal\fr-wt-markdown (branch `fix/web-ai-markdown`, created from origin/main). Read AGENTS.md and web/AGENTS.md first (layers component -> hook -> service; identifiers in English; comments in Brazilian Portuguese; every new screen text goes into web/messages/pt-BR/ and web/messages/en/). Do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add; leave every change in the working tree for review. Do not start or stop Docker containers. Do not edit docs/vibe-coding/prompts/.

## Problem
The AI text arrives as Markdown written by Gemini (`**bold**`, `### headings`, `* item` and `- item` lists, `1.` lists, `_italic_`, inline code) and the screens show it raw.
- web/src/features/alerts/components/alert-detail.tsx renders the alert assessment (`alert.assessment.content`) as plain text in a `<p className="whitespace-pre-line ...">`.
- web/src/features/assistant/components/assistant.tsx has a minimal `FormattedContent` that only understands `**bold**` and `- ` bullets.

## Tasks
1. Write a small dependency-free Markdown renderer for AI text (no new npm packages).
   - A pure parser in web/src/lib/markdown.ts that turns a string into blocks and inline nodes, testable without React. Blocks: paragraphs (a blank line separates them; a single newline inside a paragraph is a line break), headings `#` to `######`, unordered lists (`-`, `*`, `+`, `•`) with one nested level by indentation, ordered lists (`1.` and `1)`), blockquote `>`, horizontal rule (`---`, `***`). Inlines: bold (`**x**`, `__x__`), italic (`*x*`, `_x_`, never inside words: `fan_out` and `layered_fan_in` stay literal), inline code, links `[text](https://...)` (https only; anything else stays plain text), and citation markers such as `[F1]` kept as text.
   - A component web/src/components/markdown.tsx that renders the parsed tree with Tailwind classes matching the current look (text-[13px] leading-relaxed in the alert card; the assistant keeps its own sizes, so accept a className). It must never use dangerouslySetInnerHTML; all text goes through React text nodes, so `<script>` stays literal text. Links open in a new tab with rel="noopener noreferrer".
2. Use the component in alert-detail.tsx for the assessment content, and in assistant.tsx for assistant messages (replace `FormattedContent`; user messages stay plain text).
3. Make the mock assessment in web/src/features/alerts/services/alerts-service.ts (the `generateAssessment` mock text) use a little Markdown (a bold phrase and a short list), so demo mode shows the formatting.
4. Tests in web/tests/markdown.test.ts (node:test, like the other files there): bold/italic/inline code; `*` and `-` bullets and a nested item; ordered list; heading; snake_case words not turned into italic; `[F1]` preserved; `<script>alert(1)</script>` returned as plain text; a non-https link stays text; line breaks inside a paragraph.
5. If you add any visible text (e.g. an aria-label), put it in both message files.

## Verify (report each result)
`cd web && CI=true pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build`

## Final report (in English)
Files changed and added, what the parser supports, verification results, anything not done.
````

Resultado: `128-agy-markdown-result.md`.
