---
id: 050
area: frontend
autor: Claude Code (conta 1)
destino: Pedro
pai: 049
data: 2026-11-05
tipo: resposta
---

# Resultado do prompt 049: a nota de risco na tela

Branch `fix/web-score-display`, a partir da `main` em `b49acf0`.

## Por quê

O registro 044 (modelo do Vinicius) apontou três problemas na tela para quando houver
dados reais: o score não é calibrado e a tela o mostra como se fosse chance; com uma casa
decimal o topo da fila empata em 100; e o corte da fila do modelo (42,3) cai na faixa
"Baixo", que ia até 45. O rascunho da comunicação ao COAF também escrevia "Score: 87.3%".

## O que mudou

Decidido pela IA (reversível):

- **API**: o `Alert` passa a ter `queue_position` (a posição na fila da semana, que já
  existia no banco). O rascunho ao COAF troca "Score: 90.0%" por "Nota de risco do modelo:
  90,0 de 100 (ordena a fila; não é probabilidade)".
- **Front**: "Score de risco" vira "Nota de risco", com uma casa decimal e vírgula (87,3),
  e o aviso "Ordena a fila: não é a chance de ser lavagem". A fila e o detalhe mostram
  "1º na fila", que desempata o topo. As faixas saem de `web/src/lib/risk.ts`: Crítico
  (90+), Alto (70+) e Moderado; não existe mais "Baixo", porque toda conta na fila já
  passou do corte do modelo. O zod ganhou `queue_position`, e os dados simulados também
  (com notas a partir de 43, acima do corte).
- **Glossário**: "nota de risco" → `score`, e `queue_position` no contrato do `Alert`.

## Verificação

- API: `ruff check` e `ruff format --check` verdes; `pytest` inteiro verde com
  `REQUIRE_TEST_DB=1` no Postgres do Compose. Dois testes antigos conferiam o texto
  "90.0%" do rascunho e foram atualizados; um teste novo garante que o rascunho não tem
  `%`, e outro que `queue_position` sai da linha do banco.
- Web: `pnpm lint` e `pnpm build` verdes; `pnpm test` com 19 de 19, incluindo o novo
  `risk.test.ts` (as faixas nas fronteiras 90, 89,9, 70, 69,9, o corte 42,3 e o formato).
- Navegador (dados simulados, 1440px): fila e detalhe mostram "98,0", "1º na fila" e o
  aviso. Os erros de hidratação no console vêm do estilo `caret-color` que o Playwright
  injeta nos campos de data, não do código.

## Pontos em aberto

- As faixas 90 e 70 continuam fixas. Quando o worker gravar dados reais, vale olhar a
  distribuição das notas na fila e decidir se as faixas devem seguir o corte do modelo
  (`model_versions.threshold`), o que pede decidir antes qual corte vai nesse campo.
