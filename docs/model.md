# Modelo de score (LightGBM)

Como o score é calculado, como treinar e os números do modelo oficial. A escolha do modelo
(contra regras de cenário, regressão logística, GRU e Isolation Forest) foi feita em
`lab/modelo-lightgbm/`, rascunho fora do Git. Só o modelo escolhido veio para `src/fraudradar`.

Revisando a branch `feat/model-lightgbm`? Veja a seção "Para revisar esta branch", no fim.

## O que o modelo faz

1. **Score por transação.** O LightGBM dá a cada transação um número de 0 a 1, com 21
   variáveis de `features/history.py`, todas calculadas só com o passado das contas.
2. **Nota da conta na semana.** A semana vai de segunda a domingo. A nota da conta é o maior
   score entre as transações dela na semana, enviadas ou recebidas.
3. **Fila.** Entram as contas com nota acima do corte da fila (`queue_cut`), até 300 por
   semana. O corte é escolhido na validação para manter 95% das contas lavadoras.
4. **Explicação.** Cada alerta é explicado pela contribuição de cada variável (`explain`, o
   mesmo cálculo do SHAP), em log-odds, como vai para `evidence.contributions`.
5. **Segmentos.** O K-Means agrupa as contas pelo perfil das 12 semanas antes do teste
   (`accounts.segment`). Fica fora do score: serve para a tela e para medir a taxa de alerta
   por segmento.

O rótulo (`label`) só entra como alvo do treino e na avaliação. O score usa só as variáveis.

## Como treinar

```bash
uv sync --group ml
# o SAML-D.csv vai em data/ (fora do Git)
uv run --group ml python -m fraudradar.model train   # ~3 min: grava models/lightgbm_vN.txt e .json
uv run --group ml python -m fraudradar.model check   # explica 10 alertas e mostra os segmentos
uv run --group ml pytest tests/test_model.py tests/test_features.py
```

`train` grava o modelo (`lightgbm_vN.txt`), a ficha (`lightgbm_vN.json`) e uma cópia do modelo
em `lightgbm_model.txt`, o arquivo que o health da API confere. A ficha traz as variáveis, as
categorias, os parâmetros, os cortes, os segmentos e as métricas no teste. O CI instala o
grupo `ml`: os testes do modelo e do worker rodam lá também.

## Retreino por conjunto de dados

Cada conjunto (`public.datasets`) tem as próprias versões em `models/<slug>/lightgbm_vN.txt` e
`.json`. O desenho está em [external-data.md](external-data.md#retreino).

- **Pedido**: em Monitoramento, "Treinar nova versão" chama `POST /datasets/{slug}/train` e o
  `worker serve` executa o trabalho `train` (`worker/train_job.py`), com progresso em
  `GET /jobs/{id}`. A API recusa (409, com o motivo em português) quando o conjunto não tem
  gabarito, tem menos de 6 semanas rotuladas (`MIN_LABELED_WEEKS`), não tem nenhuma lavagem ou já
  tem um treino na fila. A regra é `fraudradar.model.eligibility`. A API só lê `public.datasets.labeled_weeks` e
  `has_laundering` (o worker mede e grava depois de `load`, de uma importação com gabarito e de
  cada treino; a consulta junta o gabarito com as transações e nunca roda na requisição).
- **Dado**: transações que têm gabarito, lidas do schema do conjunto. As variáveis são as de
  `compute_features`, com a configuração oficial (21 variáveis, mesmos parâmetros). O gabarito
  só vira alvo do treino e régua de teste.
- **Divisão no tempo** (`training.resolve_split`): no SAML-D (ou em qualquer dado que cubra as datas
  oficiais) vale a oficial (treino até 2023-05-21, validação a partir de 2023-04-24). Em outro
  período, o último quarto das semanas vira teste e as semanas antes dele (15%, no máximo 4)
  validação. Sempre em semanas inteiras e nunca embaralhado. `train_end`, `validation_start` e
  `training_dataset` (o slug do conjunto do treino) vão na ficha. Só nesse conjunto o worker
  recusa as semanas até `train_end`, que o modelo já viu; nos outros processa todas (ficha sem
  `training_dataset` é a do oficial, `saml-d`).
- **Versões**: no disco, `models/<slug>/lightgbm_vN.*` (a numeração continua depois do oficial).
  Onde a versão é mostrada ou guardada (`model_versions`, `datasets.active_model_version`, API) o
  retreino se chama `<slug>/vN` e o oficial `lightgbm_vN`, então nunca colidem. A ficha tem os
  mesmos campos de métrica da oficial.
  O retreino não copia nada para `lightgbm_model.txt`.
- **Promoção**: a versão nova não é usada sozinha. `POST /datasets/{slug}/models/{versão}/promote`
  grava `datasets.active_model_version` e uma linha em `audit_log` (`model_promoted`, com a versão
  anterior). Promover o modelo oficial limpa o campo (volta a seguir o oficial mais novo). As
  próximas rodadas do worker usam a versão ativa; períodos fechados não mudam.
- **Memória**: o treino no SAML-D inteiro usa ~7 GB, como o `train` pelo CSV. O trabalho lê por
  COPY com arquivo temporário e solta as variáveis assim que monta a base.

## Configuração oficial, e por quê

- **Divisão no tempo, nunca embaralhada:** treino até 23/04/2023, validação de 24/04 a
  21/05/2023 (4 semanas, só para decidir quando parar o treino) e teste de 22/05 a 23/08/2023.
- **Semana de segunda a domingo**, como o glossário e o `--week` do worker. Com a semana na
  sexta, o dia em que o SAML-D começa, os números ficam praticamente iguais.
- **O CAIXA:** em saque e depósito em espécie, o outro lado vira uma conta única (-1). O SAML-D
  inventa essa conta só nas transações normais, o que entregava a resposta em 28% das
  lavagens. O banco guarda as contas como vieram; o CAIXA só existe no cálculo.
- **Sem país, moeda e hora** (`EXCLUDED_FEATURES`): elas criam atalhos do gerador ("todo saque
  em espécie no exterior é lavagem", "todo depósito em espécie fora do horário comercial é
  lavagem") e diferença de falso positivo entre países. Fora dos atalhos, o recall fica igual.
- **Árvores pequenas e regularizadas** (`LIGHTGBM_PARAMS`), escolhidas pela validação.

## Números do modelo oficial (v1)

Teste de 22/05 a 23/08/2023. Saem da ficha `models/lightgbm_v1.json` e do
`python -m fraudradar.model check`:

| Medida | Valor |
|---|---|
| PR-AUC (validação / teste) | 0,882 / 0,896 |
| Recall com 0,13% de falso positivo | 89,7% (meta do plano: mais de 79%) |
| F1 por transação, com o corte da validação | 0,890 (precisão de 97,0% e recall de 82,1%) |
| Fila de 300: recall / precisão | 96,5% / 74,8% |
| Fila com corte: recall / precisão / inocentes por semana | 95,1% / 99,0% / 2,2 |
| Recall só nas lavagens de contas que nunca lavaram antes | 96,0% |
| Limiar da validação aplicado no teste | 0,14% de falso positivo e 90,0% de recall |
| Segmentos do K-Means | 8 (silhueta de 0,677) |

A v1 oficial é o mesmo modelo da v3 do lab: as variáveis são idênticas nas 9,5 milhões de
transações, as árvores são as mesmas, as métricas batem e nenhuma conta muda de segmento.

**Limites, para declarar à banca:**

- o dado é sintético e os números estão altos; a comparação justa é contra as regras, no
  mesmo dado (fila de 300 com 2,4% de recall);
- as tipologias em espécie são o ponto fraco: saque 59%, `smurfing` 74% e `deposit_send` 78%
  de recall;
- o falso positivo de depósitos em espécie normais é de 2,8%, contra 0,02% em cheque: quem usa
  espécie recebe muito mais alerta, e isso precisa ser acompanhado no monitoramento;
- o score ordena bem, mas não foi calibrado: na tela, 87 não quer dizer 87% de chance de ser
  lavagem;
- cada modelo rodou com uma semente só.

## De onde veio

O código veio de `lab/modelo-lightgbm/` (fora do Git), com os nomes traduzidos (ver a seção
"Modelo" de `docs/glossary.md`). Os experimentos ficaram lá, com os números no README do lab
(rodadas de 04/11/2026, com a semana de segunda a domingo):

| Modelo | PR-AUC no teste | Fila de 300: recall |
|---|---|---|
| Regras de cenário | 0,002 | 2,4% |
| Regressão logística | 0,635 | 80,9% |
| GRU | 0,887 | 96,3% |
| Isolation Forest sozinho | 0,005 | 2,9% |
| **LightGBM (oficial)** | **0,896** | **96,5%** |

O GRU fica perto, mas, com o corte, deixa 15,6 inocentes por semana para o analista, contra
2,2 do LightGBM. O Isolation Forest como variável a mais do LightGBM sobe o recall da fila em
só 0,03 ponto e ficou fora.

## Para revisar esta branch

A branch `feat/model-lightgbm`, do Vinicius, traz o modelo de `lab/modelo-lightgbm/` para o
pacote oficial. Aquela pasta é um rascunho fora do Git: quem revisa não a vê, então o que
importa está aqui ou nos registros. O que a branch muda:

| Parte | Arquivos | O que faz |
|---|---|---|
| Dependência | `pyproject.toml`, `uv.lock` | exige `lightgbm>=4.7` no grupo `ml` (o treino usa `eval_X`) |
| Dados | `src/fraudradar/data/saml_d.py` | lê o CSV com os nomes do banco e separa o gabarito |
| Variáveis | `src/fraudradar/features/` | as 26 variáveis, o CAIXA, a semana, o perfil das contas e os nomes em português (`FEATURE_LABELS`) |
| Modelo | `src/fraudradar/model/` | treino, régua, fila com corte, explicação, segmentos e os comandos `train` e `check` |
| Testes | `tests/test_data_saml_d.py`, `test_features.py`, `test_model.py` e `fake_saml_d.py` | dado sintético que cobre treino, validação e teste |
| Documentação | `docs/model.md`, `docs/glossary.md` e `README.md` | este arquivo, a seção "Modelo" do glossário e o comando de treino |
| Registro | `docs/vibe-coding/prompts/`: 038 a 044 e 051 a 056 | os prompts do Vinicius e os resultados |

Como conferir:

```bash
uv sync --group ml
uv run --group ml pytest tests/test_data_saml_d.py tests/test_features.py tests/test_model.py
uv run --group ml python -m fraudradar.model train   # com o SAML-D.csv em data/; ~3 min
uv run --group ml python -m fraudradar.model check   # 10 alertas explicados e os segmentos
```

Os números do `train` precisam bater com a tabela "Números do modelo oficial (v1)".

Decisões, com o registro de cada uma em `docs/vibe-coding/prompts/`:

- **Semana de segunda a domingo** (040): como o glossário e o `--week` do worker. Com a sexta,
  os números ficam praticamente iguais.
- **8 segmentos no K-Means** (041): a regra da maior silhueta, combinada antes de ver o
  resultado.
- **Isolation Forest fora** (051): como variável a mais do LightGBM, ele sobe o recall da fila
  em só 0,03 ponto.
- **Conferência de 10 alertas explicados**, revisada pelo Vinicius (042).
- **Sem país, moeda e hora, e o CAIXA**: ver "Configuração oficial, e por quê".

Pontos de atenção:

- O `fraudradar.model` importa sem o grupo `ml`, porque a imagem da API não o instala.
  O CI instala o grupo `ml`, então `tests/test_model.py` e `tests/worker/` rodam lá.
- O rótulo só entra como alvo do treino e na avaliação: `training.build_training_data` devolve
  o gabarito numa tabela à parte (`truth`), e o score usa só as variáveis.
- O CAIXA é aplicado no cálculo (`features.history.with_cash_account`), não na carga: o banco
  guarda as contas como vieram.
- Os três pontos sobre a nota na tela que o registro 044 levantou foram resolvidos na `main`
  pelo PR #6 (registros 049 e 050). Segue aberto: as faixas 90 e 70 continuam fixas.

O que ainda não está aqui: o worker, que é o próximo passo (052), o notebook
`notebooks/03_modelo.ipynb`. O que ficou em aberto para o time está no fim dos registros 044
e 054.
