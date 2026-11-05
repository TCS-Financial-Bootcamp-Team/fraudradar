---
id: 052
area: ml
autor: Vinicius
destino: Claude Code (PC do Vinicius)
pai: 038
data: 2026-11-05
---

Vamos fazer a parte do worker então.

(O Claude Code apresentou o plano do worker antes de escrever código: ler as transações até o
fim da semana, dar score com o modelo mais novo, montar a fila, guardar os motivos de cada
alerta e gravar `transaction_scores`, `alerts`, `evidence`, `accounts`, `model_versions` e
`weekly_batches`. Duas perguntas ficaram para o Vinicius: se os testes podem usar o Postgres
do Compose e se alguém do time já cuida do worker. Nada foi implementado ainda.)
