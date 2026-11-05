---
id: 054
area: ml
autor: Claude Code (PC do Vinicius)
destino: Vinicius
pai: 038
data: 2026-11-05
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado dos prompts 051 a 053: decisões fechadas e a branch pronta para revisão

Branch `feat/model-lightgbm`.

## O que foi feito

- **051:** o Isolation Forest fica fora. O modelo está pronto, mas a etapa só fecha quando ele
  for usado na aplicação, e por isso o próximo passo é o worker. Também falta o notebook
  `notebooks/03_modelo.ipynb`. A tipologia do alerta não é do modelo: a tela de monitoramento
  chama a medida de "Acerto de tipologia do LLM".
- **052:** o plano do worker foi apresentado, ainda sem código (ver "Pontos em aberto").
- **053:** o `docs/model.md` ganhou a seção "Para revisar esta branch" e um aviso no topo; o
  `README.md` ganhou o comando de treino e o link para o `docs/model.md`; o 044 foi corrigido
  nos pontos que mudaram. O `CLAUDE.md` e o README de `lab/modelo-lightgbm/` também foram
  atualizados, mas ficam fora do Git, no PC do Vinicius.
- Numeração: a `main` já tinha os registros 045 a 050, do Pedro, então estes são 051 a 054.

## Como foi verificado

- Só documentação mudou. `uv run ruff check .` e `uv run ruff format --check .`: verdes;
  `uv run pytest` com os grupos `api` e `ml`: 133 passed, 172 skipped.
- A branch junta com a `main` atual (`b40ddd2`) sem conflito (`git merge-tree`).

## Pontos em aberto

- **O worker (052).** Plano: para uma semana de segunda a domingo, ler as transações até o fim
  da semana (o histórico desde 07/10/2022 mais a semana), dar score com o modelo mais novo,
  montar a fila, guardar os motivos de cada alerta e gravar `transaction_scores`, `alerts`,
  `evidence`, `accounts` (com o segmento), `model_versions` e `weekly_batches` (com as
  métricas contra o gabarito). O cálculo fica em `src/fraudradar/model/scoring.py`, sem banco;
  `worker/` só lê e grava. Antes do código, o Vinicius precisa dizer se os testes podem usar o
  Postgres do Compose e se alguém do time já cuida do worker: o registro 049, do Pedro, lista
  "o worker com o agy, a partir da branch dele" como opção.
- Nada preenche a tabela `accounts` hoje, e `alerts` tem FK para ela: o worker vai ter de
  criar as contas.
- A carga do SAML-D no Postgres (frente 1) ainda não existe. Sem ela, o worker não tem o que
  processar no banco de desenvolvimento.
