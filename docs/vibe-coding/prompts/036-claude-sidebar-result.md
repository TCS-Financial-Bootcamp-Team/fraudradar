---
id: 036
area: frontend
autor: Claude Code (conta 1)
destino: Pedro
pai: 034
data: 2026-11-05
tipo: resposta
---

# Resultado do prompt 034: barra lateral do web finalizada

Branch `fix/web-sidebar-layout`. Commits:

- `e7e6a40` docs: skill das IAs (prompt 033)
- `a2c6282` chore: `.playwright-mcp/` no `.gitignore`
- `e5bbf7c` fix(web): barra lateral e topo
- este registro (034 a 036)

## Como foi feito

- A branch já tinha, sem commit, a refatoração do shell em `Sidebar`, `Header` e
  `HeaderAccountMenu`, com o estado guardado em cookie. Lint, testes e build estavam
  verdes; a revisão do diff achou seis defeitos.
- Os seis foram delegados ao agy CLI (`gemini-4-argon-high`, prompt 035): logo com 88px
  e topo com 64px (bordas desalinhadas); prop `onToggleSidebar` sem uso; o link de
  Configurações repetia a marcação do item e usava outra regra de item ativo; o menu do
  celular não fechava com Esc e os botões não tinham `aria-expanded`; `h-screen` no lugar
  de `h-dvh`; gravação em `localStorage` que ninguém lia.
- O agy corrigiu os seis só em `web/`, sem desvio do pedido. A revisão do diff não achou
  problema; só o botão de recolher no desktop ficou sem `aria-controls`, o que não foi
  pedido e não faz falta para o leitor de tela entender o botão.
- A pasta `.playwright-mcp/` (prints e logs da ferramenta de navegador das IAs) foi para
  o `.gitignore` em vez de entrar no commit.

## Verificação

- web: `pnpm lint` verde, `pnpm test` 17 de 17 (um teste novo de `isNavItemActive`, com
  os casos negativos `/alertsx` e `/`), `pnpm build` verde depois de apagar `.next`.
- Python: `ruff check` e `ruff format --check` verdes; `pytest` com 280 testes passando
  e nenhum pulado, com `REQUIRE_TEST_DB=1` no Postgres do Compose.
- No navegador (Playwright, `next dev`, dados simulados), em 1440px: recolhida e expandida,
  logo e topo com 64px, cookie `fraudradar-sidebar` alternando entre `closed` e `open`,
  só a rota atual com `aria-current`. Em 390px: menu abre por cima do conteúdo,
  `aria-expanded` e `aria-controls="app-sidebar"` corretos, sem rolagem horizontal, Esc
  fecha.

## O que o time precisa fazer depois do merge

Nada. O cookie é novo e, sem ele, a barra começa aberta.

## Pontos em aberto

- O prompt que originou a refatoração, de 03/11/2026, não foi registrado; o 034 explica
  a lacuna.
- Em `next dev`, o indicador "N" do Next fica por cima do link de Configurações no canto
  inferior esquerdo. Só aparece em desenvolvimento.
