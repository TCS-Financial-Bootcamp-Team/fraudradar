---
id: 163
area: ia
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 162
data: 2026-11-18
---

# Ajustes do assistente: loop do /ai/models, painel redimensionável, resposta sem base e fontes

A IA delegou ao agy, na branch `fix/ai-assistant-ajustes`, cinco mudanças:

1. Loop do `/ai/models`: carregar a lista uma vez só; depois de um erro, só com o botão de tentar
   de novo; sem a lista, o chat funciona sem mandar `model`.
2. Painel do chat redimensionável pela borda esquerda: largura mínima de 360 px e máxima de
   min(900 px, 70vw), largura guardada no navegador, setas do teclado, duplo clique volta ao
   padrão, desligado em telas pequenas.
3. Rota jurídica: se a base não cobre uma pergunta pertinente, o modelo começa com `[SEM_BASE]`,
   responde pelo conhecimento geral, o servidor tira as fontes e marca `grounded: false` (selo
   "Conhecimento geral"). Conferir que "O que é a tipologia fan-out?" vai para `domain`.
4. Sem falar de base, trechos ou fontes no texto: os marcadores [Fn] continuam na saída do modelo
   para a validação, mas saem do texto mostrado; as fontes ficam na lista do final. O relatório do
   alerta não muda.
5. Documentação e o exemplo de `LLM_MODEL_OPTIONS` no `.env.example`.

## Resultado

O agy entregou os cinco itens: `ruff` ok, pytest com Postgres 1074 passaram, `pnpm lint`,
`pnpm test` (125/125) e `pnpm build` ok. O `grounded` das mensagens guardadas é deduzido das
fontes, sem coluna nova.

Teste da IA com o Gemini real (`gemini-3.5-flash-lite`, banco local): "O que é a tipologia
fan-out?" foi para `domain`; prazo de comunicação e penalidades vieram com `grounded: true`, texto
sem [Fn] e as fontes na lista; criptoativos (fora da base) veio com `grounded: false`, pelo
conhecimento geral, sem fontes.

Fora do código, a IA atualizou a API de produção para a `main` `fe57675` (backup do banco,
`009_chat.sql`, imagem nova) e pôs `LLM_MODEL_OPTIONS` na produção e no `.env` local com a família
Flash que a chave aceita.
