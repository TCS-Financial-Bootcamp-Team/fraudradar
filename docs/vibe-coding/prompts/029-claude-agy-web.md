---
id: 029
area: frontend
autor: Claude Code (conta 2)
destino: agy (Antigravity CLI, gemini-4-argon-high)
pai: 027
data: 2026-10-30
---

# Rename the FraudRadar web front end to English

You are working in `C:\codigo\pessoal\fraudradar-wt-web`, a git worktree on branch
`refactor/code-in-english-web`. Dependencies are already installed in `web/node_modules`.
Work autonomously until the task is done and the gate is green; nobody will answer
questions while you run.

## Why

FraudRadar PLD is a 5-person bootcamp project (anti-money-laundering monitoring over the
synthetic SAML-D dataset). Until now the code used Portuguese names. On 2026-10-30 the
project owner decided that **every name in the code becomes English**: functions,
variables, components, hooks, types, schemas, modules, folders, files, routes, API paths
and JSON fields, CSS class names, storage and cookie keys. **Portuguese stays only in
text a person reads**: everything rendered on screen, Markdown documentation, code
comments, test descriptions, commit messages.

## The binding spec: `docs/glossary.md`

Read `docs/glossary.md` in full before touching anything, especially "API", "JSON" and
"Front". Another agent is renaming the FastAPI backend right now, in another worktree,
from the same glossary: you cannot run the real API, so implement the new contract
**exactly** as the glossary states (endpoints, path and query parameters, the multipart
field, JSON field names and enum values; JSON stays snake_case). Any deviation breaks the
integration. For internal names the glossary does not list, translate by meaning with its
vocabulary, in idiomatic English, keeping the existing conventions (camelCase variables
and functions, PascalCase components and types, kebab-case file names). If you need a
boundary name the glossary does not cover, choose the obvious translation, use it
consistently and list it in your final report. Do not edit `docs/glossary.md`.

## Rules

1. **Rename only.** No behavior, logic, styling, dependency or lockfile changes, no new
   features, no drive-by fixes. A bug you notice goes in the report.
2. **Keep Portuguese** in everything the user sees: JSX text, labels, placeholders,
   `aria-label`/`title`/`alt`, toasts, page metadata, zod validation messages, mock data
   that is displayed (names, descriptions), and the on-screen labels of enum values (keep
   a map from the English value to its Portuguese label, e.g. `"escalated"` →
   "Aprofundar"). Also keep comments and test descriptions in Portuguese, but update any
   mention of a renamed identifier, path, route or field.
3. **External contracts that do not change**: SAML-D column names in the transaction form
   and CSV preview (`Sender_account`, `Is_laundering`...); env var names (`NEXT_PUBLIC_*`
   are already English); the legacy Supabase Auth metadata key `nome` (see rule in task 4).
4. Use `git mv` for every rename (keeps history); move a whole directory with a single
   `git mv <old> <new>`. Afterwards delete empty leftover directories and run a fresh
   build so `.next` does not keep stale routes.
5. **Ownership**: only `web/**`. Never edit files outside `web/` and never touch
   `docs/vibe-coding/prompts/`, `trash/` or `.env*` files.
6. Never push, merge, rebase or change git config.
7. Windows 11 + PowerShell. `web/AGENTS.md` warns that this Next.js (16) differs from your
   training data: you are only renaming, but before touching any Next.js API (route
   files, `proxy.ts`, metadata, `next/navigation`) read the matching guide in
   `web/node_modules/next/dist/docs/`.
8. **Commits** on the current branch: one or two commits, each leaving the gate green.
   Conventional Commits in Brazilian Portuguese as in `CONTRIBUTING.md` (e.g.
   `refactor(web)!: passa rotas, contrato e nomes do front para inglês`; imperative,
   lowercase, no period, at most 72 chars; body says why), with a `BREAKING CHANGE:`
   paragraph listing the renamed routes and the new API contract. End every message with:

   ```
   Prompt: 029
   Co-Authored-By: agy (Antigravity CLI, gemini-4-argon-high)
   ```

## Read first

`AGENTS.md` (root), `web/AGENTS.md`, `web/README.md`, `web/CONTRATOS_API.md`,
`docs/glossary.md`, `web/src/proxy.ts`, `web/src/lib/api.ts`,
`web/src/features/alertas/schemas/alertas.ts`.

## Baseline (before any change)

```powershell
cd web
pnpm lint ; pnpm test ; pnpm build
```

Record the results (test count). If the baseline is not green, stop and report.

## What to rename

1. **App routes** (folders under `web/src/app`), per the glossary "Front" table:
   `(app)/alertas→alerts` (with `[id]`), `comunicacoes→reports`, `configuracoes→settings`,
   `ingestao→ingestion`, `monitoramento→monitoring`, `(auth)/cadastro→signup`,
   `recuperar-senha→reset-password`. Update every link, redirect, `router.push`/`replace`,
   the public-route list and redirects in `src/proxy.ts`, the navigation in the app shell,
   the auth callback (`?destino=recuperar` → `?next=reset`, redirecting to
   `/reset-password?mode=update`; `?erro=sessao|confirmacao` →
   `?error=session|confirmation`) and the `emailRedirectTo`/`redirectTo` URLs.
2. **Features and files**: `src/features/alertas→alerts`, `assistente→assistant`,
   `autenticacao→auth`, `configuracoes→settings`, `ingestao→ingestion`, `saude→health`,
   and every file inside (components, hooks, services, schemas, mocks), by meaning:
   e.g. `detalhe-alerta.tsx→alert-detail.tsx`, `fila-alertas.tsx→alert-queue.tsx`,
   `tabela-alertas.tsx→alerts-table.tsx`, `grafo-contas.tsx→account-graph.tsx`,
   `graficos.tsx→charts.tsx`, `comunicacoes.tsx→reports.tsx`,
   `tela-autenticacao.tsx→auth-screen.tsx`, `use-autenticacao.ts→use-auth.ts`,
   `use-perfil.ts→use-profile.ts`, `badge-saude.tsx→health-badge.tsx`,
   `painel-saude.tsx→health-panel.tsx`, `alertas-service.ts→alerts-service.ts`. Shared:
   `components/ui/campo-senha.tsx→password-field.tsx`, `campo.tsx→field.tsx`,
   `estados.tsx→states.tsx`, `painel-lateral.tsx→side-panel.tsx`,
   `hooks/use-recurso.ts→use-resource.ts`, `lib/formatacao.ts→format.ts`,
   `lib/supabase/persistencia.ts→persistence.ts`. Tests:
   `contratos.test.ts→contracts.test.ts`, `fluxos-mock.test.ts→mock-flows.test.ts`;
   `scripts/testar.mjs→scripts/run-tests.mjs` (update the `test` script in
   `package.json`). Then every identifier: components, hooks, functions, variables, props,
   types, zod schemas (names in the glossary JSON table), constants, CSS classes, ids and
   data attributes, storage keys, the cookie `fr_manter_conectado→fr_keep_signed_in`.
3. **API contract** in services, schemas, mocks and tests, exactly per the glossary:
   endpoints; query params `week`, `status`, `country`, `page`, `size`, `sort` (values
   `score_desc`, `queue`); multipart field `file`; JSON fields; enum values
   (`pending/escalated/archived/reported`, decisions `archive/escalate/report`,
   `draft/approved`, `received/processing/completed`, `connected/syncing/error`,
   health `ok/degraded`, chat roles `user/assistant`). The chat context `page` carries the
   new route paths.
4. **Supabase Auth metadata**: signup and profile updates write `user_metadata.name`;
   reading the display name uses `name` and falls back to the legacy `nome`, because
   existing users only have that key.
5. **Docs in `web/`**: `git mv web/CONTRATOS_API.md web/API_CONTRACTS.md`; keep the
   Portuguese prose and update endpoints, fields, values and routes. Update the mentions
   in `web/README.md`. Leave the managed block in `web/AGENTS.md` untouched.

## Gate (after)

```powershell
cd web
pnpm lint ; pnpm test ; pnpm build
```

All green, same test count as the baseline; the build's route list shows only the new
routes. Then:

- Search `web/src` and `web/tests` for old routes and API paths (`/alertas`,
  `/comunicacoes`, `/configuracoes`, `/ingestao`, `/monitoramento`, `/cadastro`,
  `/recuperar-senha`, `/saude`, `/semanas`, `/replay/proxima-semana`) and for old JSON
  keys: zero hits outside comments.
- Write `trash/agy-zod.json` in the worktree root (`trash/` is gitignored): for every
  exported zod schema, its JSON Schema (`z.toJSONSchema`), so the orchestrator can diff
  the contract against the backend's OpenAPI.
- **Leftover scan**: search `web/` code (outside strings and comments) for Portuguese
  stems with `rg --pcre2 -i`, e.g.
  `alerta|conta(?!in|ct)|semana|transac(?!t)|decis(?!ion)|comunic|parecer|evidenci|regra|tipolog|pais|valor|moeda|fila|lote|grafo|aresta|usuario|mensagem|resposta|pedido|recibo|fonte|ingest[ao]|saude|monitora|indicador|taxa|rotulo|nome|texto|titulo|trecho|linha|coluna|arquivo|caminho|pagina|tamanho|ordenar|origem|destino|rascunho|aprova|justificativa|erro(?!r)|carregando|ocupado|recurso|perfil|senha|cadastro|sessao|configurac|assistente|historico|contexto|papel|filtro|estado|chave|corpo|cabecalho|previa|selecion|recarregar|buscar|tela|painel|campo|botao|icone`.
  Every identifier hit must go; screen text, comments and docs stay Portuguese.

## Final report (in English)

Commits (hash and subject); baseline vs. final gate numbers; the build's route list;
boundary names you chose that the glossary does not cover; intentional Portuguese
leftovers, grouped by reason; anything unfinished; bugs or risks you noticed but did not
fix.
