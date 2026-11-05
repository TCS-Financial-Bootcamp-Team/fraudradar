---
id: 059
area: ml
autor: Claude Code (conta 1)
destino: Pedro
pai: 057
data: 2026-11-05
tipo: resposta
---

# Resultado dos prompts 057 e 058: revisão do PR #7 (modelo LightGBM)

PR #7 (`feat/model-lightgbm`, do Vinicius) aprovado e mergeado na `main` em `dfcb5b3`. A
correção do único bug achado foi num PR à parte, na branch `fix/model-card-utf8`, para não
mexer na branch dele.

## Como foi revisado

- Código lido inteiro: carga (`data/saml_d.py`), variáveis (`features/history.py`), treino,
  avaliação e segmentos (`model/`), testes e docs.
- Vazamento: as janelas do histórico terminam antes do horário da transação (nem o mesmo
  segundo entra); "contraparte nova" compara com o primeiro horário do par; o gabarito sai
  separado na carga e o rótulo do teste vira -1 antes do treino; os cortes saem da validação;
  os atalhos do gerador só olham o treino. O `test_no_future` cobre a regra principal.
- Treino do zero no SAML-D inteiro (5,4 min): 1.190 árvores e exatamente os números de
  `docs/model.md` (PR-AUC 0,896; recall 89,7% com 0,13% de falso positivo; F1 0,890; fila
  com corte 95,1% / 99,0% / 2,2 inocentes por semana). O `check` roda.
- `pytest` com os grupos `api` e `ml` e `REQUIRE_TEST_DB=1`: 307 passed, 0 skipped (o CI
  pula os testes do modelo). `ruff`, `ruff format --check` e `uv lock --check` verdes.

## Achados (publicados na revisão do PR)

1. **Bug, corrigido aqui**: a ficha do modelo (`lightgbm_vN.json`) era gravada sem
   `encoding`, com `ensure_ascii=False`. No Windows saía em cp1252, e lida como UTF-8
   quebrava (`can't decode byte 0xe7`): o worker no Docker (Linux) não conseguiria ler um
   modelo treinado no Windows. Agora grava e lê em UTF-8. O teste novo
   `test_model_card_is_utf8` falhou antes da correção (no Windows) e passa depois.
2. **Método, não bloqueia**: o K-Means testa de 3 a 8 segmentos e escolheu 8, o teto da
   busca; a silhueta pode seguir subindo. Fica com o Vinicius ampliar a faixa.
3. **Cosmético**: no terminal do Windows a saída do `train` mostra "�rvores".

## Verificação da correção

`ruff` verde; `pytest` com `api` e `ml` e `REQUIRE_TEST_DB=1`: 308 passed, 0 skipped.

## O que muda para o time

Quem já treinou no Windows antes desta correção: treine de novo (`python -m
fraudradar.model train`) para a ficha sair em UTF-8.
