---
id: 094
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Pedro
pai: 083
data: 2026-11-10
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 083: o front no estilo do protótipo

Branch `feat/web-redesign`, empilhada sobre `feat/web-alerts-toolbar` (PR #13). O Claude planejou,
dividiu, revisou e verificou; o código foi escrito por agy (Gemini 3.8 Flash), Codex (conta 2) e
Claude conta 2 (Sonnet), nesta ordem, porque as cotas do agy e do Codex acabaram no meio.

## Como foi dividido

- Fase 1 (084): motor de temas, painel de Aparência, componentes base e notificações. A especificação
  ficou em `web/DESIGN.md`; o protótipo aprovado serviu de referência fora do git.
- Em paralelo (085): `GET /monitoring` ganhou `recall_series`, `score_histogram` e `status_counts`, e
  `indicators.recall`/`typology_accuracy` passaram a vir `null` sem métrica (fim do "Recall 0%").
- Fase 2, cada frente num git worktree com arquivos disjuntos: moldura (087 → Codex 091), visão
  geral (088), fila e alerta (089), demais telas (090); as três últimas e as correções da base (086)
  terminadas pelo Sonnet (092) depois que o agy ficou sem cota.
- Revisão e ajustes (093).

## O que a revisão pegou

- Base: erro de hidratação com tema salvo, e notificação que nunca sumia com "movimento reduzido"
  (o tempo dependia do fim da animação, que o CSS reduz a 0,01 ms).
- API: um teste do worker ainda esperava `typology_accuracy == 0`.
- Moldura (conferida no navegador): menu do perfil não fechava com clique fora; Aparência abria sob a
  gaveta do assistente (o topo fixo criava uma camada própria).
- Cor fixa do âmbar de "Em investigação" → token `--warning`.
- O Sonnet tirou da tela de Fontes uma linha de envio que o agy tinha inventado.

## Verificação (rodada pelo Claude no resultado junto)

- `cd web && pnpm lint && pnpm test && pnpm build`: verdes, 44 testes.
- `uv run ruff check .`, `ruff format --check .` e `uv run --group api --group ml pytest` com
  `REQUIRE_TEST_DB=1`: 391 passed.
- `/monitoring` real na semana 28/08: recall e tipologia `null`, histograma somando os 171 alertas
  (26 em 100), status 169 pendentes e 2 para comunicação, 14 pontos de recall.
- Navegador: só a moldura foi vista (barra lateral, recolhida com dicas, perfil, assistente,
  Aparência). As telas de conteúdo passaram só por testes e build: o front exige sessão do Supabase
  até com mocks, e o Playwright do Claude desconectou no meio.

## Decisões dos agentes que o Pedro deve confirmar

- Monitoramento: barras com taxa de alerta ≥ 3,0% em vermelho (valor escolhido sem dado).
- Recall com escala fixa de 80% a 100% para destacar a meta de 95%.
- Abas da fila sem contagem: a API da fila não devolve contagem por status.
- No grafo, só a conta do alerta é destacada: a API não diz quais vizinhos também são alertas.

## Em aberto

- Conferência visual das telas de conteúdo pelo Pedro em http://localhost:3000 (Docker remontado).
- A sessão do Claude conta 2 vence entre 13 e 16/11 (`claude auth login`).
