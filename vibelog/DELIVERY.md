# Entrega do VibeLog

Aplicação independente em `vibelog/`, com Next.js 16.4.3, TypeScript strict,
Tailwind v4, componentes shadcn, temas e autenticação Supabase SSR.

- Viewer somente leitura, sem chave secreta em seu código.
- Árvore com filhos sob demanda, ancestrais preservados nos filtros e linha do tempo.
- Filtros por área múltipla, autor, tipo, branch, datas e texto, compartilháveis por URL.
- Estatísticas de prompts por área/autor e modo apresentação.
- Markdown com destaque de código, breadcrumbs, metadados e evidências com lightbox.
- CLI de nós, uploads, prints e importadores de Markdown, Claude e Codex.
- Redação de segredos e deduplicação por origem nos registros textuais.

## Verificação

- `pnpm lint`: passou, sem avisos.
- `pnpm build`: passou, incluindo TypeScript strict.
- `pnpm test`: 7 testes passaram.
- `pnpm test:e2e`: passou com autenticação e dados fictícios locais; nenhuma escrita pelo viewer.
- `pnpm vibelog import-md ../docs/vibe-coding/prompts`: 5 nós importados/atualizados.
- Repetição da importação: mesmos IDs e pais, sem duplicação.
- Recortes limitados de Claude e Codex: processados com `--dry-run`, sem escrita.
- Capturas claro, escuro e mobile revisadas em `test-results/`.

A autenticação real com senha da equipe e a apresentação com RLS real ainda precisam
ser conferidas por alguém com essas credenciais. O teste de navegador usa um servidor
fictício local; a importação Markdown foi executada no Supabase real.

O sandbox Windows desta sessão impediu `os.userInfo`, usado pelo tsx. Os testes e a CLI
foram executados com um preload temporário que fornece o nome do usuário pelas variáveis
do ambiente. Esse helper não faz parte da aplicação entregue.

## Decisões para validação

1. Datas em dias UTC e estatísticas globais de prompts.
2. Uma área predominante por nó, com filhos para dividir trabalhos mistos.
3. Sem cadastro, edição ou acesso público; as pessoas apenas navegam.
4. Transcritos são importados pelos agentes após revisão; Markdown é a fonte inicial.
5. Capturas de telas protegidas são anexadas explicitamente, sem reutilizar sessão pessoal.

Execução, arquitetura e exemplos estão no `README.md` e no `AGENTS.md`.

## Arquivos criados

```text
vibelog/
  .env.example
  .gitignore
  .npmrc
  .prettierignore
  .prettierrc.json
  AGENTS.md
  DELIVERY.md
  README.md
  components.json
  eslint.config.mjs
  next-env.d.ts
  next.config.ts
  package.json
  pnpm-lock.yaml
  postcss.config.mjs
  tsconfig.json
  scripts/
    evidence.ts
    importers.ts
    markdown.ts
    vibelog.ts
  src/
    proxy.ts
    app/
      api/records/route.ts
      error.tsx
      globals.css
      layout.tsx
      login/page.tsx
      page.tsx
      signup/page.tsx
    components/
      providers.tsx
      ui/button.tsx
      ui/dialog.tsx
      ui/password-field.tsx
    features/
      auth/
        components/login.tsx
        hooks/use-auth.ts
        schemas/signup.ts
        services/auth.ts
      records/
        components/board.tsx
        components/detail.tsx
        components/explorer.tsx
        components/record-visual.tsx
        hooks/use-records.ts
        schemas/index.ts
        services/board.ts
        services/client.ts
        services/server.ts
        services/tree.ts
    lib/
      supabase/browser.ts
      supabase/persistence.ts
      supabase/server.ts
      utils.ts
  tests/
    board.test.ts
    browser.mjs
    cli-security.test.ts
    importers.test.ts
    tree.test.ts
    web-routes.mjs
```

`.env.local` já existia e foi preservado. `test-results/` contém as capturas locais
de verificação e não é versionado. Dependências e caches também são ignorados.
