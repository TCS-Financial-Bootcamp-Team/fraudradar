---
id: 030
area: geral
autor: Claude Code (conta 2)
destino: agy (Antigravity CLI, gemini-4-argon-high)
pai: 027
data: 2026-10-30
---

# Rename the VibeLog app to English

You are working in `C:\codigo\pessoal\fraudradar-wt-vibelog`, a git worktree on branch
`refactor/code-in-english-vibelog`. Dependencies are already installed in
`vibelog/node_modules`. Work autonomously until the task is done and the gate is green;
nobody will answer questions while you run.

## Why

FraudRadar PLD is a 5-person bootcamp project. `vibelog/` is a small Next.js app plus a
CLI that records the team's AI prompts in a shared Supabase project. Until now the code
used Portuguese names. On 2026-10-30 the project owner decided that **every name in the
code becomes English**: functions, variables, components, hooks, types, schemas, modules,
folders, files, routes, CLI commands and flags, cookie keys. **Portuguese stays only in
text a person reads**: everything rendered on screen, CLI help and error messages,
Markdown documentation, code comments, test descriptions, commit messages.

## The binding spec: `docs/glossary.md`

Read `docs/glossary.md` in full, especially "O que não muda", "CLIs" and "Pastas e
arquivos". The CLI subcommands and flags must match its table **exactly**: other agents'
instructions are being rewritten from it. For names the glossary does not list,
translate by meaning, in idiomatic English, keeping the existing conventions (camelCase
variables and functions, PascalCase components and types, kebab-case file names). If you
need a boundary name the glossary does not cover, choose the obvious translation and list
it in your final report. Do not edit `docs/glossary.md`.

## Hard constraint: the Supabase schema and stored values do not change

The tables `vibelog_nos` and `vibelog_evidencias`, all their column names (`pai_id`,
`origem_id`...), the storage bucket `vibelog-evidencias`, and every stored value
(node types `prompt_humano`, `prompt_ia`, `resposta`, `marco`; areas `frontend`,
`backend`, `ml`, `ia`, `dados`, `infra`, `docs`, `geral`; evidence types) stay
byte-for-byte identical: a live shared database that other machines write to depends on
them, and `vibelog/AGENTS.md` forbids schema changes. Keep them as string literals at the
data boundary (queries, inserts, selects, row types keyed by column name) and use English
identifiers for everything else (e.g. `const NODE_TYPES = ["prompt_humano", ...]`). Do not
add mapping layers that do not exist today. Likewise, the Markdown importer keeps reading
the Portuguese frontmatter keys of `docs/vibe-coding/prompts/*.md` (`id`, `area`, `autor`,
`destino`, `pai`, `data`, `tipo`, `modelo`, `filhos`), and the transcript importers keep
reading the external Claude/Codex formats.

There is no `vibelog/.env.local` in this worktree on purpose: the real one holds a key with
write access to that database. Never create an env file with real keys, and never run a
CLI command that would write to Supabase (`node`, `evidence`, `print`, `import-*`):
use `--dry-run` only.

## Rules

1. **Rename only.** No behavior, logic, styling, dependency or lockfile changes, no new
   features, no drive-by fixes. A bug you notice goes in the report.
2. **Keep Portuguese** in on-screen text (JSX text, labels, placeholders, `aria-label`,
   toasts, the display labels of node types and areas), CLI help and error messages,
   comments, test descriptions and Markdown prose; update any mention of a renamed
   identifier, path, route, command or flag inside them.
3. Use `git mv` for every rename (keeps history); move a whole directory with a single
   `git mv <old> <new>`. Afterwards delete empty leftover directories.
4. **Ownership**: only `vibelog/**`. Never edit files outside `vibelog/`, never touch
   `docs/vibe-coding/prompts/` or `trash/`.
5. Never push, merge, rebase or change git config.
6. Windows 11 + PowerShell. This Next.js (16) differs from your training data: before
   touching any Next.js API, read the matching guide in `vibelog/node_modules/next/dist/docs/`.
7. **Commits** on the current branch: one or two commits, each leaving the gate green.
   Conventional Commits in Brazilian Portuguese as in `CONTRIBUTING.md` (e.g.
   `refactor(vibelog)!: passa nomes, rotas e flags da CLI para inglês`; imperative,
   lowercase, no period, at most 72 chars; body says why), with a `BREAKING CHANGE:`
   paragraph listing the renamed CLI subcommands and flags. End every message with:

   ```
   Prompt: 030
   Co-Authored-By: agy (Antigravity CLI, gemini-4-argon-high)
   ```

## Read first

`vibelog/AGENTS.md`, `vibelog/README.md`, `vibelog/ENTREGA.md`, `docs/glossary.md`,
`vibelog/scripts/vibelog.ts`, `vibelog/src/features/registros/schemas/index.ts`.

## Baseline (before any change)

```powershell
cd vibelog
pnpm lint ; pnpm test ; pnpm build
```

Record the results (test count). If `pnpm build` fails only because Supabase env vars are
missing, record that and use `pnpm exec tsc --noEmit` as the type gate instead. If
anything else is red, stop and report.

## What to rename

1. **CLI** (`scripts/vibelog.ts`), exactly per the glossary: subcommands `no→node`,
   `evidencia→evidence`, `print`, `importar-md→import-md`, `importar-claude→import-claude`,
   `importar-codex→import-codex`; flags `--tipo→--type`, `--autor→--author`,
   `--titulo→--title`, `--pai→--parent`, `--destino→--target`, `--modelo→--model`,
   `--origem-id→--source-id`, `--arquivo→--file`, `--no→--node`, `--legenda→--caption`,
   `--tema escuro|claro→--theme dark|light`; `--area`, `--branch`, `--commit`, `--url`,
   `--dry-run`, `--help` unchanged. Values accepted by `--type` and `--area` stay the
   stored ones. Help and error messages stay Portuguese but name the new flags.
2. **Files and folders**: `scripts/evidencias.ts→evidence.ts`,
   `importadores.ts→importers.ts`; `src/app/api/registros→records`,
   `src/app/cadastro→signup`; `src/components/ui/campo-senha.tsx→password-field.tsx`;
   `src/features/autenticacao→auth` (`schemas/cadastro.ts→signup.ts`);
   `src/features/registros→records` (`detalhe.tsx→detail.tsx`,
   `explorador.tsx→explorer.tsx`, `quadro.tsx→board.tsx`,
   `registro-visual.tsx→record-visual.tsx`, `use-registros.ts→use-records.ts`,
   `services/arvore.ts→tree.ts`, `cliente.ts→client.ts`, `quadro.ts→board.ts`,
   `servidor.ts→server.ts`); `src/lib/supabase/persistencia.ts→persistence.ts`; tests
   `arvore.test.ts→tree.test.ts`, `importadores.test.ts→importers.test.ts`,
   `navegador.mjs→browser.mjs`, `quadro.test.ts→board.test.ts`,
   `rotas-web.mjs→web-routes.mjs`, `seguranca-cli.test.ts→cli-security.test.ts`. Update
   `package.json` scripts and every import.
3. **Identifiers and routes**: every component, hook, function, variable, prop, type,
   zod schema and constant; routes `/cadastro→/signup` and `/api/registros→/api/records`
   (and every link, redirect, fetch and the route list in `src/proxy.ts`); the cookie
   `vl_manter_conectado→vl_keep_signed_in`. Supabase Auth: signup writes
   `user_metadata.name` instead of `nome` (if anything reads the name, read `name` and fall
   back to `nome`).
4. **Docs in `vibelog/`**: `git mv vibelog/ENTREGA.md vibelog/DELIVERY.md`; keep the
   Portuguese prose; update commands, flags, paths and routes in `vibelog/AGENTS.md`
   (its examples must use the new subcommands and flags), `vibelog/README.md` and
   `vibelog/DELIVERY.md`.

## Gate (after)

```powershell
cd vibelog
pnpm lint ; pnpm test ; pnpm build
```

All green (or the same env-only build failure as the baseline, plus a clean
`pnpm exec tsc --noEmit`), same test count as the baseline. Then prove the CLI still
parses, without network access:

```powershell
pnpm vibelog node --type prompt_humano --area geral --author teste --title "teste" --source-id "dry:1" --file README.md --dry-run
pnpm vibelog import-md ../docs/vibe-coding/prompts --dry-run
```

The first prints the record it would send; the second lists every prompt record with its
Portuguese frontmatter read correctly. If dry-run needs the network or env vars, say so
in the report instead of working around it.

**Leftover scan**: search `vibelog/` code (outside strings and comments) for Portuguese
stems with `rg --pcre2 -i`, e.g.
`registro|\bnos?\b|evidencia|importar|importador|quadro|arvore|\bpai|filho|tipo|autor|titulo|destino|origem|arquivo|legenda|tema|cadastro|autenticac|sessao|senha|cliente|servidor|persistencia|detalhe|explorador|\bseco\b|gravar|\bler|redigir|sanitizar|transcrito|rotulo|opcoes|requerido|valor|nome|erro(?!r)|carregando|ocupado|chave|caminho|conteudo|resultado|alvo`.
Identifier hits must go, except stored values and column names covered by the hard
constraint; on-screen text, CLI messages, comments and docs stay Portuguese.

## Final report (in English)

Commits (hash and subject); baseline vs. final gate numbers; the dry-run outputs (first
lines); boundary names you chose that the glossary does not cover; intentional
Portuguese leftovers, grouped by reason; anything unfinished; bugs or risks you noticed
but did not fix.
