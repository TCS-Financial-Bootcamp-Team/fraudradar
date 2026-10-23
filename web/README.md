# web/

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.

```bash
pnpm install
pnpm dev     # http://localhost:3000 (API em NEXT_PUBLIC_API_URL, padrão http://localhost:8000)
pnpm lint
pnpm build
```

Organização: `src/features/<modulo>/{components,hooks,services,schemas}`.
Fluxo: componente → hook → service → API. Componentes nunca chamam `fetch`.
Exemplo pronto: `src/features/saude`.
