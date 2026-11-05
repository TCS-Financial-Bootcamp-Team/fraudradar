---
id: 044
area: ml
autor: Claude Code (PC do Vinicius)
destino: Vinicius
pai: 038
data: 2026-11-05
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado dos prompts 038 a 043: o modelo LightGBM no pacote oficial

Branch `feat/model-lightgbm`, a partir da `main` em `b49acf0`. Antes ela se chamava
`modelo/modelo-lightgbm` e nunca tinha sido enviada ao GitHub.

## Como foi feito

**No lab (`lab/modelo-lightgbm/`, fora do Git):**

- Ambiente próprio, com as mesmas versões de pacotes que geraram os números do modelo. A
  rodada antiga, com a semana começando na sexta, se repetiu linha por linha.
- Semana (039 e 040): com a semana de segunda a domingo, o treino vai até o domingo
  21/05/2023, e os números ficaram praticamente iguais (PR-AUC no teste 0,896 contra 0,895;
  fila com corte: recall 95,1% contra 94,2% e 2,2 contra 1,6 inocentes por semana).
- Com a segunda, todas as comparações do lab foram refeitas (regras, logística, GRU, Isolation
  Forest e as rodadas sem grupos de variáveis). O modelo foi gravado de novo e a conferência
  de 10 alertas foi refeita; o Vinicius revisou e concordou com a leitura (042).
- Três conclusões mudaram com a segunda: o K-Means passou a escolher 8 segmentos, e não 3
  (041: ficam 8); o Isolation Forest passou a subir o recall da fila em 0,03 ponto (segue
  fora; o Vinicius confirmou no 051); e o segmento das contas que usam espécie tem falso positivo de 0,092%,
  16 vezes o maior dos outros segmentos.

**No repositório:**

- `69f649b` chore(model): exige o LightGBM 4.7 no grupo ml
- `9ffef45` feat(data): carrega o SAML-D para o treino com os nomes do banco
- `b74e21f` model(features): calcula as variáveis de histórico das contas
- `f8f66e0` model(model): treina o LightGBM e monta a fila semanal por conta
- `8460fb2` docs(docs): documenta o modelo e os nomes novos no glossário
- o commit deste registro (038 a 044)

O código veio do lab com os nomes do banco e do glossário (`occurred_at`, `sender`,
`receiver`, `amount`, `payment_type`...), e os valores de `payment_type` são os do SAML-D. O
CAIXA saiu da carga e foi para o cálculo das variáveis: o banco guarda as contas como vieram.
Os experimentos (regras, logística, GRU, Isolation Forest) ficaram no lab, como pede a skill.
O `fraudradar.model` importa sem o grupo `ml`, porque o CI e a imagem da API não o instalam.

## Como foi verificado

- Variáveis: `compute_features` no SAML-D inteiro dá as mesmas 26 variáveis do lab, idênticas
  nas 9.504.852 transações, inclusive a ordem das categorias de `payment_type`.
- Modelo: `python -m fraudradar.model train` (Python 3.12, pelo `uv`) gravou a v1 com 1.190
  árvores. Com os nomes traduzidos, o arquivo do modelo é idêntico ao do lab, e as métricas da
  ficha batem: PR-AUC 0,896 (validação 0,882); recall com 0,13% de falso positivo 89,7%; F1
  0,890; fila com corte: recall 95,1%, precisão 99,0% e 2,2 inocentes por semana. Os centros
  do K-Means diferem só na 16ª casa decimal (arredondamento); nenhuma das 447.647 contas muda
  de segmento.
- `python -m fraudradar.model check` sorteia os mesmos 10 alertas do lab, com as mesmas
  contribuições.
- `uv run ruff check .` e `uv run ruff format --check .`: verdes. `uv run pytest` com os
  grupos `api` e `ml`: 133 passed, 172 skipped (os da API, sem banco de teste). Como no CI (só
  `api` e `dev`), cada commit foi testado sozinho: 121 passed no das variáveis e 122 no último;
  o arquivo de testes do modelo é pulado. `uv lock --check`: verde.
- Não rodei `pnpm lint` nem `pnpm build`: nada em `web/` mudou.
- `docs/model.md`: os 18 números foram conferidos por script contra a ficha, o `check` e os
  resultados do lab.

## O que o time precisa fazer depois

- Para treinar: `uv sync --group ml`, o `SAML-D.csv` em `data/` e
  `uv run --group ml python -m fraudradar.model train` (~3 min). Detalhes em `docs/model.md`.
- Revisar e abrir o PR desta branch. O PR não foi aberto: o pedido foi subir a branch.

## Pontos em aberto

- O CI não instala o grupo `ml`, então lá os testes do modelo são pulados. Acrescentar
  `--group ml` ao `uv sync` do `ci.yml` faz eles rodarem (decisão da frente 5).
- O worker ainda não usa o modelo. Falta gravar `transaction_scores`, `alerts` (com a nota da
  conta e a posição na fila), `evidence.contributions` e `accounts.segment`. E falta decidir
  qual corte vai em `model_versions.threshold`: o da transação ou o da fila.
- A tipologia do alerta não é do modelo: a tela de monitoramento chama a medida de "Acerto de
  tipologia do LLM", então ela vem do parecer da IA (frente 3). Até lá, `alerts.typology` fica
  vazio ("Indefinida" na tela).
- O score na tela: ele não é uma probabilidade calibrada; com uma casa decimal, o topo empata
  em 100; e o corte da fila (42,3 na tela) cai na faixa "Baixo", que vai até 45. Resolvido na
  `main` pelo PR #6 (registros 049 e 050).
- Os prompts da conversa que escolheu o modelo, num repositório de teste, não estão neste
  registro.
- O Victor tem `lab/FraudRadar_LightGBM.ipynb` na branch `victor`: vale comparar.
- A pasta do lab se chama `lab/modelo-lightgbm/`, e não `lab/<pessoa>/`, como pede a skill.

(Atualizado em 05/11/2026, depois do 051: o Isolation Forest foi confirmado fora, a tipologia é
do LLM e os pontos da nota na tela foram resolvidos na `main`.)
