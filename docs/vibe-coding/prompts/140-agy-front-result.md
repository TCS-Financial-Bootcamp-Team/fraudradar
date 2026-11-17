---
id: 140
area: frontend
autor: agy (gemini-4-hydrogen-high)
pai: 138
data: 2026-11-17
---

# Resultado do agy: navegação sem recarga, paginação e parecer em modal

- Tela inicial e logo apontam para `/dashboard`; barra lateral na ordem Dashboard, Alertas, Contas.
- `useResource` mantém o dado anterior enquanto busca o novo (`refreshing`), com `resetKey` para trocar de entidade (alerta, conta, conjunto). A tela não é mais trocada pelo "carregando" ao mudar página, semana ou filtro, nem ao gerar o parecer; a região em atualização fica esmaecida com `aria-busy` e uma barra fina.
- Componente `Pagination` (números com reticências, campo "Ir para", modo compacto) na fila de alertas e nas contas suspeitas; algoritmo puro em `web/src/lib/pagination.ts`.
- Card do parecer mostra só o resumo; "Ver parecer completo" abre um modal (Base UI) com selos, o relatório por seções, fontes recolhíveis com link oficial, download `.md` e impressão/PDF.
- Chat: fontes num "Fontes (N)" recolhido; nada quando a resposta não tem fonte. Quebra de texto longa corrigida no Markdown e nos balões.
- Verificação do revisor (Claude): `pnpm lint`, `pnpm test` (109/109) e `pnpm build` passaram.
