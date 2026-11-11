---
id: 080
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Pedro
pai: 075
data: 2026-11-10
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 075: topo limpo, semana e busca na fila, aprovação dentro do alerta

Branch `feat/web-alerts-toolbar`, sem commit. Código escrito pelo agy (Gemini 3.8 Flash High) em
duas rodadas (076 e 079); o Claude gerenciou, revisou o diff e verificou.

## A pergunta das semanas

Não falta dado. O SAML-D vai de 07/10/2022 a 23/08/2023. Antes de 22/05/2023 é treino (até 23/04)
e validação (24/04 a 21/05) do modelo, e o worker recusa essas semanas sem `--allow-in-sample`,
porque daria nota com o gabarito já visto. 22/05 a 21/08 são as 14 semanas de teste (a de 21/08 tem
só três dias). A de 28/08 veio do CSV ingerido pela tela, não do SAML-D.

## O que mudou

- Barra superior: só o botão do menu, tema, notificações e conta. Saíram a semana, a "Busca global
  em breve" e o texto "Semana de referência".
- Fila (`/alerts`): único lugar para trocar a semana; o seletor mede o próprio texto e não corta
  mais. Busca de verdade por número do alerta ou começo da conta (`search` em `GET /alerts`).
- Visão geral e Monitoramento mostram "Semana de dd/mm/aaaa · trocar na fila de alertas".
- `/reports` e o item "Comunicações" do menu removidos. A revisão e a aprovação do rascunho ao COAF
  ficam no detalhe do alerta, que aparece logo depois da decisão "Preparar comunicação ao COAF".
  Com a comunicação aprovada, o formulário de decisão fica travado (a API já respondia 409).
- README, `web/API_CONTRACTS.md`, glossário, skill de visão geral (as duas cópias) e o teste de
  rotas do VibeLog atualizados.

## Revisão do Claude (rodada 079)

A primeira rodada do agy dizia "nenhuma pendência", mas o diff tinha três defeitos: 500 na busca
com dígito não ASCII ("²") ou número acima do bigint; o detalhe buscava o relatório em todo alerta
e engolia o erro (404 no console a cada alerta, 500 escondido); e o bloqueio do formulário depois
da aprovação, citado no relatório, não estava no código. Os três foram corrigidos com testes.

## Verificação (rodada pelo Claude, depois da 079)

- `uv run ruff check .` e `ruff format --check .`: verdes.
- `uv run --group api --group ml pytest` com `REQUIRE_TEST_DB=1` num banco `_test` próprio:
  387 passed, 0 pulados.
- `cd web && pnpm lint && pnpm test && pnpm build`: verdes; 19 testes; `/reports` fora das rotas.
- App real (Docker remontado, login do Supabase): topo e menu limpos; busca "1225" trouxe só o
  alerta 3126; seletor com texto inteiro (scrollWidth = clientWidth); alerta 3126 com
  "Revisão aprovada" e decisão travada; alerta 3127 sem chamada de relatório nem erro no console,
  e o rascunho apareceu sem recarregar depois da decisão.

## Em aberto

- Sem commit nem PR: o Pedro não pediu.
- O alerta 3127 ficou com uma decisão de teste no banco local.
- "1 alertas encontrados" (plural) é texto antigo da fila, não desta mudança.
