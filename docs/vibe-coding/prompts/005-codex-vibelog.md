---
id: 005
autor: Claude Code
destino: Codex (escritor VibeLog)
pai: 004
data: 2026-10-26
area: docs
modelo: gpt-6.1-sol / reasoning high
---

Build "VibeLog", a small standalone app that records the vibe-coding prompt tree of the FraudRadar project, in the NEW folder `vibelog/` at repo root C:\codigo\pessoal\fraudradar (Windows, pnpm). Another agent is editing `web/` right now: do NOT touch `web/`, `api/`, `worker/`, `src/`, `db/`. Read `AGENTS.md` first. UI text and comments in PT-BR.

## What it is
Humans never type into it. AIs (Claude Code, Codex, Cursor) register nodes; humans (the 5-person team and the bootcamp jury) only browse. Tree: human prompt -> AI prompt to another AI -> AI response/result -> evidence (screenshots, commits, logs). It covers ALL work areas, not only frontend: frontend, backend, ml (model training), ia (LLM/RAG), dados, infra, docs, geral — filtering by area is central.

## Database (already created in Supabase project ocxkrrieeggurpcczirv, public schema; do not change it)
- `vibelog_nos`: id uuid, pai_id uuid null (self FK), tipo ('prompt_humano'|'prompt_ia'|'resposta'|'marco'), area ('frontend'|'backend'|'ml'|'ia'|'dados'|'infra'|'docs'|'geral'), autor text (e.g. 'pedro', 'claude-conta-2', 'codex-conta1'), destino text null, modelo text null, titulo text, conteudo text, resumo text null, branch text null, commit_sha text null, origem text null (source file), origem_id text unique null (dedupe key), meta jsonb, criado_em timestamptz.
- `vibelog_evidencias`: id, no_id FK, tipo ('print'|'commit'|'log'|'link'|'arquivo'), storage_path null, url null, legenda null, criado_em.
- Private storage bucket `vibelog-evidencias`.
- RLS: authenticated users can SELECT both tables and the bucket objects; writes only with the secret key (bypasses RLS).
Env in `vibelog/.env.local` (exists, gitignored, never print it): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY. Create `vibelog/.env.example` with empty values.

## 1. Viewer (Next.js latest App Router + TS strict + Tailwind v4 + shadcn + next-themes + @supabase/ssr)
- Login with Supabase Auth email/password (same users as the main app; no sign-up screen). Read-only: the app never uses the secret key.
- Layout: left = collapsible tree (lazy children, counts, icon/color per tipo and area), right = node detail (full content rendered as markdown with code blocks, metadata chips, branch/commit link to https://github.com/<repo> if `meta.repo` exists, evidence gallery with signed URLs + lightbox, breadcrumb to root).
- Filters (URL query params, shareable): area (multi), autor, tipo, branch, date range, full-text search on titulo/conteudo. Filtering must keep ancestors visible so the tree stays navigable.
- Header stats: number of prompts per area and per author. A "Linha do tempo" view (chronological list) as alternative to the tree.
- Light/dark theme, clean professional look, responsive, good for projecting in a presentation (a "modo apresentação" with larger font is welcome).
- Component -> hook -> service pattern, zod schemas, no fetch inside components, errors via toast.

## 2. CLI for the AIs: `vibelog/scripts/vibelog.ts` (run with `pnpm vibelog <cmd>` via tsx), uses SUPABASE_SECRET_KEY
- `no --tipo --area --autor --titulo [--pai <id|origem_id>] [--destino] [--modelo] [--branch] [--commit] [--origem-id] (--arquivo <path> | stdin)` -> inserts (upsert by origem_id), prints the id.
- `evidencia --no <id> --tipo <t> (--arquivo <png|log> | --url <u>) [--legenda]` -> uploads to bucket at `<no_id>/<timestamp>-<name>` and inserts the row.
- `print --no <id> --url <http://localhost:3000/...> [--tema claro|escuro] [--legenda]` -> takes a screenshot with Playwright (devDependency; chromium) and stores it as evidence.
- `importar-md <dir>` -> imports `docs/vibe-coding/prompts/*.md` (YAML frontmatter: id, autor, destino, pai, data, area, modelo; body = conteudo). origem_id = `md:<id>`; `pai` refers to another file id -> `md:<pai>`. Run it at the end against `docs/vibe-coding/prompts/`.
- `importar-claude <session.jsonl>` and `importar-codex <session.jsonl>` -> parse Claude Code transcripts (`C:\Users\Pedro\.claude-conta2\projects\C--codigo-pessoal-fraudradar\*.jsonl`) and Codex sessions (`C:\Users\Pedro\.codex\sessions\YYYY\MM\DD\*.jsonl`). Inspect format with `head -c` only (files can be big). Extract real user prompts (skip tool results/system reminders) and the final assistant answer of each turn; dedupe with origem_id = `<source>:<session>:<uuid>`; never import secrets: redact strings matching `sbp_`, `sb_secret_`, `sk-`, JWTs, and `postgres://...:pass@`. Make import idempotent. Do not run these imports yourself, just test on a small slice in dry-run mode (`--dry-run` prints what would be inserted).
- `vibelog/AGENTS.md`: short instructions for any AI on WHEN and HOW to register (every human prompt, every delegation prompt, each result with commit + screenshots), with copy-paste examples. Keep it under 60 lines.

## Done criteria
`cd vibelog && pnpm lint && pnpm build` pass; `pnpm vibelog importar-md ../docs/vibe-coding/prompts` inserts the existing nodes (show the count). Print at the end: files created, commands, and decisions for the product owner to validate.
