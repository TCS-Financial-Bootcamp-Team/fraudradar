# web/

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.

Copie `.env.example` desta pasta para `web/.env.local` e preencha a URL e a
chave pública do Supabase. O Next não carrega automaticamente o `.env` da raiz.
Nunca use uma chave service-role no frontend. `NEXT_PUBLIC_USE_MOCKS=true`
habilita os dados demonstrativos; a autenticação continua usando o Supabase.

```bash
pnpm install
pnpm dev     # http://localhost:3000 (API em NEXT_PUBLIC_API_URL, padrão http://localhost:8000)
pnpm lint
pnpm test
pnpm build
```

Organização: `src/features/<modulo>/{components,hooks,services,schemas}`.
Fluxo: componente → hook → service → API. Componentes nunca chamam `fetch`.
Exemplo pronto: `src/features/saude`.

No Supabase, habilite e-mail/senha e cadastre as URLs permitidas:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/callback?destino=recuperar`
- As URLs equivalentes no domínio de implantação.

Configure a Site URL e a entrega de e-mail do projeto para cadastro e recuperação.
O callback usa PKCE e troca o código por uma sessão em cookies. `src/proxy.ts`
renova a sessão, protege a área do app e preserva cookies em redirecionamentos.
O layout privado também verifica a identidade. Sem configuração válida, `/login`
apresenta instruções de setup. Nenhum bypass de autenticação é habilitado por mocks.

Variáveis `NEXT_PUBLIC_*` são incorporadas no build: refaça o build após alterá-las.
No modo real, a API recebe o JWT do Supabase e deve validar identidade e acesso.
Nunca há chamadas diretas do navegador ao banco ou ao LLM.

Consulte [CONTRATOS_API.md](./CONTRATOS_API.md) e os schemas Zod para implementar
as respostas, paginação, ingestão, chat e sincronização. A semana inicial da demo
é 2026-10-19. Em modo real, o seletor inicia na segunda-feira da semana atual (UTC).

O runner de testes compila arquivos TypeScript isolados com esbuild e usa
`node:test`. Os artefatos temporários são criados em `../trash/` e removidos ao final.
As comunicações ao COAF são exclusivamente simuladas.
