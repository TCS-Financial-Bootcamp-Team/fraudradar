<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Visual

Toda tela nova ou alterada segue `web/DESIGN.md`: tokens do tema (nunca cor fixa), tipografia,
moldura, cartões, tabelas e gráficos. Os temas vivem em `src/lib/theme` e `src/components/theme`;
notificações só por `notify` (`src/lib/notify.ts`).
