# Análise Exploratória de Dados — SAML-D

**Projeto:** FraudRadar
**Dataset:** Synthetic Anti-Money Laundering Transaction Dataset (SAML-D)
**Finalidade:** documentar a análise exploratória realizada antes do treinamento dos modelos de identificação de transações suspeitas.
**Atualização:** versão ampliada em 11/11/2026 com análises e gráficos adicionais do notebook `FraudRadar_LightGBM(1).ipynb`.

---

## 1. Objetivo da análise exploratória

A análise exploratória de dados (Exploratory Data Analysis — EDA) busca compreender a estrutura, a qualidade, a distribuição e as relações presentes no conjunto de dados antes da etapa de modelagem.

No FraudRadar, a EDA foi utilizada para:

- conhecer as colunas e os tipos de dados disponíveis;
- verificar valores ausentes, duplicados e valores monetários inválidos;
- compreender a distribuição da variável-alvo `Is_laundering`;
- investigar valores das transações, modalidades de pagamento, moedas e localizações bancárias;
- analisar a recorrência, a concentração e a diversidade de relacionamentos entre contas;
- explorar padrões por hora, dia da semana, dia e mês;
- comparar transações entre localizações bancárias iguais e diferentes;
- estudar a relação entre `Laundering_type` e a variável-alvo;
- produzir gráficos que facilitam a interpretação dos padrões encontrados.

A EDA também orienta decisões posteriores de pré-processamento e Machine Learning. Ela não comprova que uma transação específica seja criminosa: os resultados descrevem os rótulos e padrões disponíveis no dataset.

## 2. Características gerais do dataset

O SAML-D é um conjunto de dados **sintético** voltado ao monitoramento de transações financeiras e ao estudo de comportamentos associados à lavagem de dinheiro.

| Característica                     |     Resultado observado |
| ----------------------------------- | ----------------------: |
| Registros                           |               9.504.852 |
| Colunas                             |                      12 |
| Registros com `Is_laundering = 0` |               9.494.979 |
| Registros com `Is_laundering = 1` |                   9.873 |
| Percentual da classe positiva       |               0,103873% |
| Percentual da classe negativa       |              99,896127% |
| Período observado                  | 07/10/2022 a 23/08/2023 |

A dimensão original lida no notebook é **(9.504.852, 12)**. O documento de Machine Learning também registra `(9.504.852, 10)` em uma seção de leitura inicial. Como os materiais não explicam explicitamente a origem dessa diferença, vale conferir qual dataframe ou etapa gerou a dimensão de 10 colunas antes de apresentá-la como equivalente ao CSV original.

### 2.1 Dicionário de dados

| Coluna                     | Significado                              | Tipo observado no notebook | Uso na análise                                                                                   |
| -------------------------- | ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `Time`                   | Horário da transação                  | Texto (`str`)            | Conversão para timestamp e extração de atributos temporais (horário de referência UTC+00:00) |
| `Date`                   | Data da transação                      | Texto (`str`)            | Referência temporal                                                                              |
| `Sender_account`         | Identificador da conta remetente         | Inteiro (`int64`)        | Agrupamento de envios                                                                             |
| `Receiver_account`       | Identificador da conta destinatária     | Inteiro (`int64`)        | Agrupamento de recebimentos                                                                       |
| `Amount`                 | Valor informado da transação           | Decimal (`float64`)      | Distribuição e estatísticas monetárias                                                        |
| `Payment_currency`       | Moeda utilizada no pagamento             | Texto (`str`)            | Frequência e taxa por moeda                                                                      |
| `Received_currency`      | Moeda recebida                           | Texto (`str`)            | Frequência e taxa por moeda                                                                      |
| `Sender_bank_location`   | Localização bancária do remetente     | Texto (`str`)            | Comparação por origem                                                                           |
| `Receiver_bank_location` | Localização bancária do destinatário | Texto (`str`)            | Comparação por destino                                                                          |
| `Payment_type`           | Modalidade de pagamento                  | Texto (`str`)            | Frequência e taxa por modalidade                                                                 |
| `Is_laundering`          | Indicador binário utilizado como alvo   | Inteiro (`int64`)        | Classificação: 0 ou 1                                                                           |
| `Laundering_type`        | Tipologia associada à transação       | Texto (`str`)            | Análise descritiva das categorias                                                                |

**Atenção aos identificadores:** `Sender_account` e `Receiver_account` são armazenadas como números inteiros, mas representam identificadores de contas. Não se deve interpretar sua média ou distância numérica como uma medida financeira ou como uma relação de proximidade entre contas.

## 3. Análise inicial e qualidade dos dados

### 3.1 Inspeção da estrutura

O notebook utiliza `head()`, `tail()`, `columns`, `dtypes`, `describe()` e `shape` para observar as primeiras e últimas linhas, nomes das colunas, tipos e estatísticas descritivas.

Foi observado que `Date` e `Time` são carregadas como texto. Para análises cronológicas mais completas, essas informações podem ser convertidas para um tipo `datetime` combinado.

### 3.2 Valores ausentes

Verificação utilizada:

```python
dataset.isna().sum().sort_values(ascending=False)
```

**Resultado:** as 12 colunas apresentaram zero valores ausentes (`NaN`). Portanto, o notebook não precisou realizar imputação de valores ausentes nessa etapa.

A ausência de `NaN` não significa, por si só, que todos os campos estejam semanticamente corretos; significa apenas que essa verificação não encontrou valores ausentes reconhecidos pelo Pandas.

### 3.3 Registros duplicados

Verificação utilizada:

```python
dataset.duplicated().sum()
```

**Resultado:** 0 linhas integralmente duplicadas.

A verificação considera a repetição exata de todos os valores da linha. Isso é diferente de uma conta realizar transações recorrentes: a recorrência pode ser parte legítima do comportamento financeiro e é investigada separadamente no notebook.

No notebook complementar, também foi feita uma verificação de duplicidade operacional usando a combinação de remetente, destinatário, timestamp, valor, moedas e modalidade de pagamento. O resultado também foi **zero ocorrências**. Essa verificação é mais específica do que comparar somente o par de contas e o horário: ela procura registros que repetem simultaneamente os principais campos da operação.

### 3.4 Valores monetários

| Verificação de `Amount` |        Resultado |
| --------------------------- | ---------------: |
| Mínimo                     |             3,73 |
| Máximo                     |    12.618.498,40 |
| Valores iguais a zero       |                0 |
| Valores negativos           |                0 |
| Soma infinita               | Não (`False`) |

O notebook apresenta a seguinte verificação para infinitos:

```python
np.isinf(dataset["Amount"].sum())
```

Tecnicamente, essa expressão verifica se a **soma** é infinita, e não se existe algum valor infinito individual na coluna. Para verificar cada observação, uma forma mais direta seria:

```python
np.isinf(dataset["Amount"]).any()
```

Os valores mínimo e máximo apresentados indicam uma amplitude monetária elevada. Valores extremos devem ser investigados, mas não removidos automaticamente: um valor alto não comprova lavagem de dinheiro.

### 3.5 Consistência dos identificadores e dos timestamps

O notebook complementar acrescentou verificações de consistência:

| Verificação                                                       | Resultado observado |
| ------------------------------------------------------------------- | ------------------: |
| Valores de `Amount` não positivos                                |                   0 |
| Valores não finitos em `Amount`                                  |                   0 |
| IDs de remetente ou destinatário menores ou iguais a zero          |                   0 |
| Transferências em que remetente e destinatário são a mesma conta |                   0 |
| Timestamps ausentes ou inválidos após conversão                  |                   0 |
| Inversões na ordem cronológica do dataframe                       |                   0 |
| Valores distintos de `Is_laundering` além de 0 e 1               |              Nenhum |

Esses resultados indicam que, nas verificações realizadas, não foram encontrados problemas nesses campos. A checagem de ordem cronológica se refere à sequência atual das linhas no dataframe; não comprova, isoladamente, que qualquer divisão posterior de treino, validação e teste esteja livre de vazamento temporal.

## 4. Distribuição da variável-alvo — `Is_laundering`

A variável `Is_laundering` é o alvo binário utilizado no problema de classificação:

- `0`: transação não identificada como lavagem no dataset;
- `1`: transação identificada como lavagem no dataset.

| Classe                              |          Quantidade |     Percentual |
| ----------------------------------- | ------------------: | -------------: |
| 0 — Não identificada como lavagem |           9.494.979 |     99,896127% |
| 1 — Identificada como lavagem      |               9.873 |      0,103873% |
| **Total**                     | **9.504.852** | **100%** |

### 4.1 Desbalanceamento de classes

O conjunto apresenta **desbalanceamento extremo**: a classe negativa representa aproximadamente 99,9% dos registros, enquanto a classe positiva representa aproximadamente 0,1%.

Isso afeta o treinamento e, principalmente, a interpretação das métricas. Um classificador que previsse todas as transações como classe 0 teria acurácia de aproximadamente **99,896127%**, embora não identificasse nenhuma transação positiva.

Por esse motivo, a acurácia isolada não é suficiente. Na avaliação dos modelos, devem ser observadas métricas como:

- **Precisão (Precision):** entre as transações sinalizadas como positivas, qual proporção realmente pertence à classe positiva?
- **Revocação (Recall):** entre todas as transações positivas existentes, qual proporção foi identificada?
- **F1-score:** média harmônica entre precisão e recall.
- **PR-AUC:** área sob a curva Precisão-Recall, útil para avaliar o desempenho em diferentes limiares quando a classe positiva é rara.

A EDA evidencia, portanto, por que a equipe precisa avaliar a capacidade de identificar a classe minoritária, e não apenas a quantidade total de acertos.

> **Cuidado na interpretação:** o valor `1` é o rótulo fornecido pelo dataset sintético. Ele não constitui, por si só, uma confirmação jurídica ou independente de que houve crime financeiro.

![Distribuição das classes em escala logarítmica](EDA_SAML-D_graficos/01_desbalanceamento_classes.png)

*Figura 1 — Distribuição de transações normais e positivas. A escala logarítmica permite visualizar a classe minoritária sem ocultá-la pela diferença de volume.*

## 5. Distribuição dos valores das transações — `Amount`

A coluna `Amount` representa o valor informado para cada transação.

### 5.1 Estatísticas gerais

| Estatística   |     Resultado |
| -------------- | ------------: |
| Quantidade     |     9.504.852 |
| Média         |      8.762,97 |
| Mediana        |      6.113,72 |
| Desvio padrão |     25.614,95 |
| Mínimo        |          3,73 |
| Máximo        | 12.618.498,40 |

A média é superior à mediana e o desvio padrão é elevado em relação à média. Isso é compatível com uma distribuição assimétrica à direita: muitos valores estão concentrados em uma faixa inferior, enquanto uma quantidade menor de observações apresenta valores muito elevados.

### 5.2 Comparação entre as classes

| Estatística | Classe 0 — Normal no rótulo | Classe 1 — Positiva no rótulo |
| ------------ | ----------------------------: | ------------------------------: |
| Quantidade   |                     9.494.979 |                           9.873 |
| Média       |                      8.729,88 |                       40.587,67 |
| Mediana      |                      6.114,63 |                        5.322,79 |
| Mínimo      |                          3,73 |                           15,82 |
| Máximo      |                    999.962,19 |                   12.618.498,40 |

A média das transações positivas é aproximadamente 4,65 vezes a média da classe negativa. Entretanto, a mediana das positivas é menor. Isso mostra que uma quantidade menor de valores extremamente elevados influencia fortemente a média da classe positiva.

### 5.3 Percentis

| Percentil     |  Classe 0 |   Classe 1 |
| ------------- | --------: | ---------: |
| P25           |  2.142,93 |   2.723,79 |
| P50 (mediana) |  6.114,63 |   5.322,79 |
| P75           | 10.458,95 |   9.789,67 |
| P90           | 16.558,43 |  21.197,62 |
| P95           | 22.031,33 |  39.698,43 |
| P99           | 44.938,16 | 419.540,08 |

A diferença no P99 indica uma cauda superior muito mais elevada entre as transações positivas. Isso sugere que valores extremos podem contribuir para distinguir distribuições, mas não que todo valor elevado seja suspeito.

### 5.4 Transformação logarítmica

O notebook cria `Amount_log` com:

```python
dataset["Amount_log"] = np.log1p(dataset["Amount"])
```

A função `log1p(x)` calcula `log(1 + x)`. Essa transformação comprime a escala dos valores e facilita a visualização de distribuições com cauda longa.

A transformação:

- não remove registros;
- não elimina valores extremos;
- não converte moedas;
- não garante, isoladamente, melhora no desempenho de um modelo.

### 5.5 Comparação de `Amount` por moeda de pagamento

O notebook complementar compara a distribuição de `Amount` entre as categorias de `Payment_currency`, separando as classes. O gráfico inclui boxplots para as 13 moedas e uma distribuição específica para a categoria UK pounds.

**Ponto importante sobre a unidade:** a documentação técnica do SAML-D informa que `Amount` já foi padronizada em libras esterlinas (GBP). `Payment_currency` e `Received_currency` descrevem as moedas da operação, mas não significam que os números de `Amount` estejam expressos em 13 unidades monetárias diferentes. Assim, não é necessário interpretar o campo `Amount` como valores nativos sem conversão. O notebook não realiza uma conversão adicional.

![Distribuição de Amount por moeda de pagamento e classe](EDA_SAML-D_graficos/03_amount_por_moeda_e_classe.png)

*Figura 2 — Distribuição de `Amount` por `Payment_currency` e classe. As categorias têm quantidades muito diferentes de registros positivos; percentis extremos de grupos pequenos devem ser interpretados com cautela.*

A comparação mostra sobreposição entre as distribuições. Embora os percentis superiores das transações positivas sejam elevados em algumas categorias, a mediana da classe positiva pode ser inferior à mediana da classe negativa. Portanto, `Amount` isoladamente não separa perfeitamente as classes.

## 6. Modalidades de pagamento — `Payment_type`

O dataset possui sete modalidades de pagamento.

### 6.1 Volume e quantidade de positivos

| Modalidade      | Total de transações | Transações positivas | Taxa positiva |
| --------------- | --------------------: | ---------------------: | ------------: |
| Cash Deposit    |               225.206 |                  1.405 |     0,623873% |
| Cash Withdrawal |               300.477 |                  1.334 |     0,443961% |
| Cross-border    |               933.931 |                  2.628 |     0,281391% |
| ACH             |             2.008.807 |                  1.159 |     0,057696% |
| Credit card     |             2.012.909 |                  1.136 |     0,056436% |
| Debit card      |             2.012.103 |                  1.124 |     0,055862% |
| Cheque          |             2.011.419 |                  1.087 |     0,054041% |

A taxa é calculada pela média da variável binária `Is_laundering` em cada categoria, equivalente a:

\[
\text{Taxa positiva} = \frac{\text{Quantidade de positivos}}{\text{Total da categoria}} \times 100
\]

### 6.2 Interpretação

- **Cross-border** apresenta a maior quantidade absoluta de registros positivos: 2.628.
- **Cash Deposit** apresenta a maior taxa proporcional: 0,623873%.
- **Cash Withdrawal** apresenta a segunda maior taxa proporcional: 0,443961%.

Quantidade absoluta e taxa proporcional respondem a perguntas diferentes. A quantidade indica quantos positivos existem em uma categoria; a taxa considera também o tamanho total da categoria.

Essas proporções descrevem o dataset sintético. Não permitem concluir que uma modalidade seja inerentemente criminosa ou perigosa em operações reais.

### 6.3 Participação de cada modalidade no total de positivos

Além da taxa positiva dentro de cada modalidade, o notebook complementar calcula quanto cada categoria representa do total de 9.873 registros positivos:

| Modalidade      | Positivas | Taxa dentro da modalidade | Participação no total de positivas |
| --------------- | --------: | ------------------------: | -----------------------------------: |
| Cross-border    |     2.628 |                   0,2814% |                             26,6180% |
| Cash Deposit    |     1.405 |                   0,6239% |                             14,2307% |
| Cash Withdrawal |     1.334 |                   0,4440% |                             13,5116% |
| ACH             |     1.159 |                   0,0577% |                             11,7391% |
| Credit card     |     1.136 |                   0,0564% |                             11,5061% |
| Debit card      |     1.124 |                   0,0559% |                             11,3846% |
| Cheque          |     1.087 |                   0,0540% |                             11,0098% |

A nova medida ajuda a responder uma terceira pergunta: **qual parcela de todos os registros positivos está associada a cada modalidade?** Cross-border representa a maior parcela do total de positivos, embora Cash Deposit tenha a maior taxa dentro da própria categoria.

![Volume total e taxa positiva por modalidade](EDA_SAML-D_graficos/04_modalidades_volume_e_taxa.png)

*Figura 3 — Comparação do volume de transações e da taxa positiva por modalidade. O gráfico permite distinguir categorias grandes de categorias com taxa proporcional mais elevada.*

## 7. Moedas — `Payment_currency` e `Received_currency`

O notebook identificou 13 categorias em cada coluna.

- `Payment_currency`: moeda indicada para o pagamento.
- `Received_currency`: moeda indicada para o recebimento.

### 7.1 Moeda de pagamento

| Moeda           |     Total | Positivas | Taxa positiva |
| --------------- | --------: | --------: | ------------: |
| Moroccan dirham |    25.395 |        90 |     0,354400% |
| Dirham          |    27.263 |        89 |     0,326450% |
| Swiss franc     |    27.492 |        82 |     0,298269% |
| Indian rupee    |    24.657 |        68 |     0,275784% |
| Mexican Peso    |    24.852 |        68 |     0,273620% |
| Turkish lira    |    27.996 |        73 |     0,260752% |
| Albanian lek    |    24.778 |        64 |     0,258294% |
| Yen             |    25.562 |        65 |     0,254284% |
| US dollar       |    26.061 |        60 |     0,230229% |
| Naira           |    27.143 |        62 |     0,228420% |
| Pakistani rupee |    27.196 |        62 |     0,227975% |
| Euro            |   117.164 |       260 |     0,221911% |
| UK pounds       | 9.099.293 |     8.830 |     0,097041% |

### 7.2 Moeda recebida

| Moeda           |     Total | Positivas | Taxa positiva |
| --------------- | --------: | --------: | ------------: |
| Naira           |    45.046 |       288 |     0,639346% |
| Moroccan dirham |    45.748 |       285 |     0,622978% |
| Albanian lek    |    45.736 |       262 |     0,572853% |
| Dirham          |    42.797 |       225 |     0,525738% |
| Mexican Peso    |    45.255 |       235 |     0,519280% |
| Turkish lira    |    42.545 |       218 |     0,512399% |
| Pakistani rupee |    45.993 |       204 |     0,443546% |
| Indian rupee    |    43.757 |       172 |     0,393080% |
| Euro            |   231.911 |       716 |     0,308739% |
| US dollar       |    43.664 |       118 |     0,270246% |
| Swiss franc     |    42.931 |       113 |     0,263213% |
| Yen             |    45.814 |       118 |     0,257563% |
| UK pounds       | 8.783.655 |     6.919 |     0,078771% |

### 7.3 Interpretação e limitação

As distribuições e taxas são diferentes entre moeda de pagamento e moeda recebida. A libra esterlina predomina em volume nas duas colunas, enquanto outras moedas apresentam taxas positivas proporcionais maiores.

A categoria UK pounds representa 9.099.293 registros em `Payment_currency` (95,7331%) e 8.783.655 em `Received_currency` (92,4123%). O euro aparece em segundo lugar em ambas as colunas, mas com volume muito menor.

Conforme a definição técnica do SAML-D, `Amount` já está padronizada em GBP. `Payment_currency` e `Received_currency` são atributos categóricos que registram a moeda associada ao pagamento e ao recebimento; os notebooks analisados não fazem conversão adicional de `Amount`. Essa distinção deve ser preservada ao explicar os campos.

![Volume por moeda de pagamento e de recebimento](EDA_SAML-D_graficos/02_volume_moedas_pagamento_recebimento.png)

*Figura 4 — Frequência das categorias em `Payment_currency` e `Received_currency`. A predominância de UK pounds é muito maior do que a das demais categorias.*

## 8. Localizações bancárias — remetente e destinatário

O notebook identifica 18 categorias em cada coluna e compara o total de operações, a quantidade positiva e a taxa positiva.

### 8.1 Localização do remetente

| Localização |     Total | Positivas | Taxa positiva |
| ------------- | --------: | --------: | ------------: |
| Morocco       |    18.437 |        55 |     0,298313% |
| Mexico        |    17.662 |        44 |     0,249122% |
| Netherlands   |    16.770 |        41 |     0,244484% |
| India         |    17.596 |        42 |     0,238691% |
| Italy         |    18.895 |        45 |     0,238158% |
| Germany       |    19.259 |        43 |     0,223272% |
| Austria       |    18.050 |        38 |     0,210526% |
| Japan         |    18.468 |        38 |     0,205761% |
| Switzerland   |    20.503 |        41 |     0,199971% |
| USA           |    19.027 |        36 |     0,189205% |
| UAE           |    20.081 |        34 |     0,169314% |
| France        |    18.702 |        31 |     0,165758% |
| Albania       |    17.648 |        28 |     0,158658% |
| Spain         |    19.391 |        27 |     0,139240% |
| Turkey        |    20.902 |        27 |     0,129174% |
| Nigeria       |    20.027 |        25 |     0,124831% |
| Pakistan      |    20.346 |        25 |     0,122874% |
| UK            | 9.183.088 |     9.253 |     0,100761% |

### 8.2 Localização do destinatário

| Localização |     Total | Positivas | Taxa positiva |
| ------------- | --------: | --------: | ------------: |
| Nigeria       |    38.272 |       251 |     0,655832% |
| Morocco       |    38.704 |       253 |     0,653679% |
| Albania       |    38.783 |       235 |     0,605936% |
| UAE           |    35.897 |       195 |     0,543221% |
| Mexico        |    38.385 |       197 |     0,513221% |
| Turkey        |    35.586 |       177 |     0,497387% |
| Pakistan      |    38.980 |       169 |     0,433556% |
| Netherlands   |    37.314 |       148 |     0,396634% |
| Austria       |    38.844 |       154 |     0,396458% |
| India         |    36.936 |       137 |     0,370912% |
| Italy         |    36.517 |       131 |     0,358737% |
| Germany       |    38.540 |       102 |     0,264660% |
| USA           |    36.850 |        87 |     0,236092% |
| Spain         |    37.288 |        87 |     0,233319% |
| Japan         |    38.729 |        83 |     0,214310% |
| Switzerland   |    36.081 |        77 |     0,213409% |
| France        |    38.512 |        82 |     0,212921% |
| UK            | 8.864.634 |     7.308 |     0,082440% |

### 8.3 Interpretação

O Reino Unido concentra a maior parte do volume de transações, tanto como localização de remetente quanto de destinatário. Entretanto, várias outras localizações apresentam taxas proporcionais positivas maiores.

Essa diferença reforça a importância de comparar taxas, e não apenas contagens absolutas. Os resultados não devem ser interpretados como uma classificação de países por risco real: eles descrevem a distribuição construída no SAML-D.

### 8.4 Mapa de calor origem × destino

O notebook constrói uma matriz com `pivot_table()`:

```python
matriz = (
    dataset.pivot_table(
        index="Sender_bank_location",
        columns="Receiver_bank_location",
        values="Is_laundering",
        aggfunc="mean"
    ) * 100
)
```

Cada célula representa a taxa percentual de transações positivas para uma combinação de localização do remetente e do destinatário. O gráfico de calor facilita a comparação das combinações, mas uma taxa elevada em uma célula não comprova, isoladamente, uma atividade criminosa.

### 8.5 Operações entre localizações iguais e diferentes

O notebook complementar cria uma comparação binária entre transações em que `Sender_bank_location` é igual a `Receiver_bank_location` e transações em que as localizações são diferentes:

| Relação entre as localizações | Total de transações | Positivas | Participação do volume | Taxa positiva |
| --------------------------------- | --------------------: | --------: | -----------------------: | ------------: |
| Mesma localização               |             8.570.504 |     6.828 |                 90,1698% |       0,0797% |
| Localizações diferentes         |               934.348 |     3.045 |                  9,8302% |       0,3259% |

A taxa positiva observada para operações entre localizações diferentes é aproximadamente **4,09 vezes** a taxa das operações na mesma localização. Esse resultado é uma associação encontrada no dataset sintético, não uma regra de risco aplicável a países ou transações reais. O volume e a taxa devem ser analisados juntos, porque as operações entre localizações diferentes representam uma parcela menor do total.

![Volume e taxa positiva por localização bancária](EDA_SAML-D_graficos/10_localizacoes_bancarias_volume_e_taxa.png)

*Figura 5 — Comparação do volume e das taxas positivas para localizações de remetentes e destinatários. O volume é fortemente concentrado em UK; as taxas proporcionais apresentam outra distribuição.*

## 9. Comportamento das contas e relacionamentos

O notebook agrupa as transações por conta remetente, conta destinatária e par remetente-destinatário. Essa análise procura identificar recorrência e volume de movimentações.

### 9.1 Contas remetentes

Agrupamento utilizado:

```python
envios = (
    dataset.groupby("Sender_account")
      .agg(
          quantidade_envios=("Amount", "size"),
          valor_total_enviado=("Amount", "sum"),
          valor_medio_enviado=("Amount", "mean"),
          quantidade_destinatarios=("Receiver_account", "nunique")
      )
      .sort_values("quantidade_envios", ascending=False)
)
```

Os indicadores calculados são:

- `quantidade_envios`: quantidade de transações enviadas pela conta;
- `valor_total_enviado`: soma dos valores associados aos envios;
- `valor_medio_enviado`: média dos valores enviados;
- `quantidade_destinatarios`: quantidade de contas destinatárias distintas.

No resultado exibido, a conta mais frequente entre as primeiras 20 possui 754 envios, soma de 4.450.195,04, média de 5.902,12 e 25 destinatários distintos.

### 9.2 Contas destinatárias

O agrupamento de recebimentos calcula:

- `quantidade_recebimentos`: quantidade de transações recebidas;
- `valor_total_recebido`: soma dos valores recebidos;
- `valor_medio_recebido`: média dos valores recebidos;
- `quantidade_remetentes`: quantidade de contas remetentes distintas.

No resultado exibido, a conta mais frequente entre as primeiras 20 possui 751 recebimentos, soma de 4.182.791,24, média de 5.569,63 e 17 remetentes distintos.

### 9.3 Pares de contas

O notebook também agrupa por `Sender_account` e `Receiver_account` simultaneamente:

```python
pares_contas = (
    dataset.groupby(["Sender_account", "Receiver_account"])
    .agg(
        quantidade_transacoes=("Amount", "size"),
        valor_total=("Amount", "sum"),
        valor_medio=("Amount", "mean")
    )
    .sort_values("quantidade_transacoes", ascending=False)
)
```

Os pares mais recorrentes exibidos apresentam até 84 transações entre a mesma origem e o mesmo destino.

### 9.4 Fan-in e Fan-out

Esses termos ajudam a explicar estruturas de movimentação entre contas:

- **Fan-in:** várias contas de origem enviam valores para uma mesma conta de destino.
- **Fan-out:** uma conta de origem envia valores para várias contas de destino.

Esses padrões podem ser úteis na investigação de redes de transações. Contudo, o simples fato de uma conta apresentar muitos envios, recebimentos ou destinatários diferentes não prova comportamento ilícito.

**Limitação da análise atual:** os agrupamentos de contas e pares são ordenados por frequência, mas não cruzam diretamente esses agregados com `Is_laundering`. Logo, os primeiros colocados são os mais recorrentes, não necessariamente os mais suspeitos.

### 9.5 Distribuição e concentração das movimentações por conta

O notebook complementar unifica as participações de uma conta como remetente e como destinatária para calcular a quantidade total de eventos associados a cada conta. Nesse cálculo, cada transação gera um evento para a conta remetente e outro para a conta destinatária. Foram identificadas:

| Indicador                                        | Resultado |
| ------------------------------------------------ | --------: |
| Contas distintas que aparecem como remetente     |   292.715 |
| Contas distintas que aparecem como destinatária |   652.266 |
| Contas que aparecem nos dois papéis             |    89.521 |
| Contas distintas na união dos dois papéis      |   855.460 |

A distribuição é bastante assimétrica. A mediana é de 12 movimentações por conta no total, enquanto o máximo observado é 1.498. Ao separar os papéis, a mediana é 12 para remetentes e 13 para destinatários. Há uma cauda de contas com movimentação muito acima desses valores.

O notebook também mede concentração: o 1% de contas com mais movimentações (8.555 contas) reúne 30,23% dos eventos; os 5% (42.773 contas) reúnem 54,49%; e os 10% (85.546 contas) reúnem 58,73%. Isso demonstra concentração de atividade no conjunto, mas não indica automaticamente irregularidade.

![Distribuição de movimentações por conta](EDA_SAML-D_graficos/08_distribuicao_movimentacoes_por_conta.png)

*Figura 6 — Distribuições de movimentações como remetente, destinatário e total. O eixo vertical está em escala logarítmica; as linhas tracejadas indicam as medianas.*

O notebook informa ainda que 4.950 contas distintas aparecem como remetentes e 4.074 como destinatárias de transações positivas. Considerando a união dos dois papéis, são 7.902 contas, cerca de 0,92% das 855.460 contas distintas. Essa contagem descreve contas associadas a pelo menos um rótulo positivo, não uma avaliação de risco independente por conta.

### 9.6 Diversidade de contrapartes e recorrência dos pares

O novo notebook também calcula quantas contrapartes distintas cada conta encontra:

| Indicador                              | Média | Mediana | P95 | P99 | Máximo |
| -------------------------------------- | -----: | ------: | --: | --: | ------: |
| Destinatários distintos por remetente |   3,03 |       1 |  22 |  45 |      60 |
| Remetentes distintos por destinatário |   1,36 |       1 |   1 |  17 |      50 |

Foram identificados **887.497 pares direcionados distintos** (remetente → destinatário). Desses, 781.631 aparecem em mais de uma transação. As transações que pertencem a pares repetidos somam 9.398.986, aproximadamente 98,89% do dataset. O par mais recorrente aparece em 84 transações.

Entre os registros positivos, o notebook identifica 7.758 pares direcionados distintos. Isso não significa que todos os pares repetidos sejam suspeitos: a repetição também pode representar relações recorrentes legítimas entre contas.

![Diversidade de relacionamentos financeiros](EDA_SAML-D_graficos/09_diversidade_contrapartes.png)

*Figura 7 — Distribuição do número de contrapartes distintas por remetente e por destinatário. A mediana igual a 1 mostra que a maioria das contas se relaciona com uma contraparte, enquanto uma cauda menor apresenta redes mais amplas.*

Esses indicadores ajudam a formular hipóteses para análises futuras de rede, Fan-in e Fan-out. Para transformar essas hipóteses em sinais de detecção, seria necessário relacionar as métricas por conta e por janela temporal aos rótulos e avaliar a generalização em períodos posteriores.

## 10. Tipologias — `Laundering_type`

O notebook cruza `Laundering_type` com `Is_laundering` usando `pd.crosstab()` e calcula a taxa positiva por categoria.

### 10.1 Tipologias positivas encontradas

| Tipologia            | Registros positivos |
| -------------------- | ------------------: |
| Structuring          |               1.870 |
| Cash_Withdrawal      |               1.334 |
| Smurfing             |                 932 |
| Deposit-Send         |                 945 |
| Layered_Fan_In       |                 656 |
| Layered_Fan_Out      |                 529 |
| Stacked Bipartite    |                 506 |
| Behavioural_Change_1 |                 394 |
| Bipartite            |                 383 |
| Cycle                |                 382 |
| Fan_In               |                 364 |
| Gather-Scatter       |                 354 |
| Scatter-Gather       |                 338 |
| Behavioural_Change_2 |                 345 |
| Single_large         |                 250 |
| Fan_Out              |                 237 |
| Over-Invoicing       |                  54 |

A tabela de contingência apresenta 17 categorias com registros exclusivamente positivos e 11 categorias iniciadas por `Normal_` com registros exclusivamente negativos.

### 10.2 Relação com a variável-alvo e Data Leakage

No resultado observado, todas as categorias de tipologia não normal possuem `Is_laundering = 1`, enquanto as categorias `Normal_...` possuem `Is_laundering = 0`. A taxa calculada é, portanto, 100% para as categorias positivas e 0% para as categorias normais.

Essa correspondência perfeita é um alerta de **Data Leakage (vazamento de dados)** para a tarefa de prever `Is_laundering`.

Se `Laundering_type` for fornecida como atributo de entrada, o modelo poderá receber uma informação que já revela a classe-alvo. Além disso, em uma aplicação de detecção, essa tipologia pode ser uma anotação produzida depois de uma investigação, e não uma informação disponível no instante da transação.

Assim, a coluna pode ser utilizada para análise descritiva das categorias, mas deve ser excluída dos atributos preditivos no cenário de classificação utilizado pelo projeto, salvo se houver uma justificativa diferente e independente para seu uso.

## 11. Análise temporal

O notebook complementar amplia a análise temporal original. Em vez de observar somente a hora extraída de `Time`, ele combina `Date` e `Time` em um timestamp, verifica a ordem cronológica e calcula padrões por hora, dia da semana, dia e mês.

**Fuso horário:** a documentação técnica do SAML-D informa que os horários foram padronizados para UTC+00:00. Portanto, as horas e os dias apresentados abaixo devem ser interpretados nesse referencial, e não automaticamente como horário local do Brasil.

### 11.1 Volume e taxa por hora

A hora é extraída do timestamp e as transações são agrupadas por faixa de 0 a 23 horas. O notebook calcula o volume total, a quantidade de positivos e a taxa positiva em cada hora.

A hora **07:00 UTC** apresenta a maior taxa positiva registrada nessa agregação: aproximadamente **0,1558%**, com 222 transações positivas em 142.497 operações. O horário com maior volume de transações está na faixa diurna, com aproximadamente 540 mil operações em cada hora entre 08:00 e 17:00. Volume e taxa, portanto, não representam a mesma dimensão.

### 11.2 Taxa por dia da semana

O notebook também agrupa as transações por dia da semana. As taxas positivas observadas foram:

| Dia da semana | Taxa positiva |
| ------------- | ------------: |
| Sexta-feira   |       0,1083% |
| Quinta-feira  |       0,1077% |
| Segunda-feira |       0,1060% |
| Quarta-feira  |       0,1049% |
| Terça-feira  |       0,1040% |
| Sábado       |       0,0980% |
| Domingo       |       0,0980% |

As diferenças são pequenas em termos absolutos. Esses percentuais não demonstram que um dia seja inerentemente mais arriscado; descrevem apenas a frequência dos rótulos positivos no conjunto sintético e no fuso UTC usado pelo dataset.

![Análise temporal por hora e dia da semana](EDA_SAML-D_graficos/05_temporal_hora_e_dia_semana.png)

*Figura 8 — Quatro painéis com volume e taxa positiva por hora e por dia da semana. A linha percentual deve ser lida separadamente das barras de volume.*

### 11.3 Evolução diária e média móvel

O período entre 07/10/2022 e 23/08/2023 contém **321 dias corridos**. O notebook apresenta, em média, cerca de 29.610 transações e 30,76 registros positivos por dia. A taxa positiva média diária informada é de aproximadamente 0,1040%.

A taxa diária máxima observada foi de 0,2033%. Para suavizar oscilações entre dias, foi calculada uma taxa móvel de sete dias, ponderada pela soma dos positivos dividida pela soma das transações na janela. No período, essa taxa móvel variou aproximadamente de 0,0550% a 0,1618%.

![Evolução diária da taxa positiva e média móvel](EDA_SAML-D_graficos/06_evolucao_diaria_taxa_e_media_movel.png)

*Figura 9 — Evolução diária da taxa positiva e taxa móvel ponderada de sete dias. As oscilações mostram variação no dataset, mas não estabelecem por si só uma tendência causal ou estável.*

### 11.4 Comparação mensal

| Mês           | Transações | Positivas | Taxa positiva |
| -------------- | -----------: | --------: | ------------: |
| Outubro/2022   |      708.654 |       694 |       0,0979% |
| Novembro/2022  |      897.621 |       794 |       0,0885% |
| Dezembro/2022  |      900.341 |       907 |       0,1007% |
| Janeiro/2023   |      908.320 |       940 |       0,1035% |
| Fevereiro/2023 |      904.806 |       946 |       0,1046% |
| Março/2023    |      908.562 |       927 |       0,1020% |
| Abril/2023     |      902.883 |       962 |       0,1065% |
| Maio/2023      |      917.601 |       866 |       0,0944% |
| Junho/2023     |      897.243 |     1.024 |       0,1141% |
| Julho/2023     |      902.239 |       983 |       0,1090% |
| Agosto/2023    |      656.582 |       830 |       0,1264% |

![Volume mensal e taxa positiva](EDA_SAML-D_graficos/07_evolucao_mensal_volume_e_taxa.png)

*Figura 10 — Volume e taxa positiva por mês. Outubro de 2022 e agosto de 2023 são períodos parciais no dataset, por isso seus volumes não devem ser comparados diretamente com meses completos.*

Agosto apresenta a maior taxa mensal da tabela, mas o mês termina em 23/08/2023. Outubro também começa em 07/10/2022. Essas diferenças de cobertura devem ser levadas em conta antes de interpretar variações mensais.

### 11.5 Limites da interpretação temporal

As agregações temporais ajudam a localizar períodos com diferentes volumes e proporções de rótulos positivos. Elas não substituem a análise de sequências e de comportamento por conta. Também não demonstram causalidade, sazonalidade recorrente ou uma regra operacional que possa ser aplicada diretamente a instituições financeiras reais.

## 12. Visualizações produzidas

Os notebooks utilizam Seaborn, Matplotlib e Plotly para explorar e comunicar os dados. A tabela abaixo resume as visualizações mais relevantes para a documentação e para a apresentação:

| Visualização                                            | Objetivo                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Distribuição de `Is_laundering`                       | Evidenciar o desbalanceamento entre as classes                               |
| Histogramas e boxplots de `Amount` / `Amount_log`     | Observar assimetria, dispersão e valores extremos                           |
| `Amount` por moeda e classe                             | Comparar distribuições entre categorias de moeda de pagamento              |
| Volume e taxa por `Payment_type`                        | Comparar contagens, taxas internas e participação no total de positivos    |
| Volume por moeda                                          | Comparar a frequência em `Payment_currency` e `Received_currency`       |
| Taxas por localização e mapa de calor origem × destino | Comparar taxas por localização e combinação de origem/destino            |
| Mesma localização × localização diferente            | Comparar operações domésticas e entre localizações distintas no dataset |
| Distribuição de movimentações por conta               | Mostrar assimetria e concentração das contas                               |
| Diversidade de contrapartes                               | Comparar o número de relacionamentos por remetente e destinatário          |
| Volume e taxa por hora e dia da semana                    | Explorar distribuição intradiária e semanal                               |
| Evolução diária e média móvel                        | Acompanhar oscilações diárias da taxa positiva                            |
| Volume e taxa mensal                                      | Comparar períodos mensais, respeitando meses parciais                       |
| Categorias de `Laundering_type`                         | Exibir a relação entre tipologias e rótulos, com alerta de vazamento      |

### 12.1 Gráficos adicionais extraídos do notebook complementar

Os dez arquivos abaixo foram extraídos das saídas gráficas do notebook do colega e incluídos junto deste Markdown no pacote de entrega:

1. `01_desbalanceamento_classes.png` — distribuição das classes em escala logarítmica.
2. `02_volume_moedas_pagamento_recebimento.png` — volume por moeda de pagamento e recebimento.
3. `03_amount_por_moeda_e_classe.png` — distribuição de `Amount` por moeda de pagamento e classe.
4. `04_modalidades_volume_e_taxa.png` — volume e taxa positiva por modalidade de pagamento.
5. `05_temporal_hora_e_dia_semana.png` — volume e taxa por hora e dia da semana.
6. `06_evolucao_diaria_taxa_e_media_movel.png` — evolução diária e média móvel ponderada de sete dias.
7. `07_evolucao_mensal_volume_e_taxa.png` — volume e taxa positiva por mês.
8. `08_distribuicao_movimentacoes_por_conta.png` — movimentações como remetente, destinatário e total.
9. `09_diversidade_contrapartes.png` — distribuição de contrapartes distintas por conta.
10. `10_localizacoes_bancarias_volume_e_taxa.png` — volume e taxa positiva por localização bancária.

Os caminhos das imagens são relativos à pasta `EDA_SAML-D_graficos/`; mantenha essa pasta ao lado do Markdown para que as figuras apareçam corretamente em visualizadores compatíveis.

Em algumas visualizações interativas do notebook de análise original, foi utilizada uma amostra composta por todas as transações positivas e 100.000 transações negativas, selecionadas com `random_state=42`. Essa observação vale para os gráficos construídos com essa amostra específica. Os gráficos adicionais relacionados acima foram extraídos das saídas do notebook complementar e devem ser interpretados conforme os agrupamentos e filtros descritos em cada seção; não se deve assumir que todos utilizam a mesma amostragem.

## 13. Principais conclusões da EDA

1. O dataset possui 9.504.852 transações e 12 colunas, com período entre 07/10/2022 e 23/08/2023.
2. Não foram encontrados valores ausentes, duplicatas exatas, duplicatas segundo a assinatura operacional utilizada, timestamps inválidos, IDs de conta não positivos ou transferências da conta para ela mesma.
3. A variável-alvo é extremamente desbalanceada: apenas 0,103873% dos registros são positivos.
4. `Amount` apresenta grande amplitude e assimetria à direita; a transformação `log1p` facilita a visualização da cauda longa.
5. A documentação do dataset define `Amount` como padronizada em GBP; os campos de moeda descrevem atributos da operação e não indicam 13 unidades diferentes para `Amount`.
6. Cash Deposit tem a maior taxa positiva dentro da modalidade, enquanto Cross-border reúne a maior quantidade e participação absoluta no total de registros positivos.
7. As moedas e localizações apresentam distribuições diferentes entre pagamento, recebimento, remetente e destinatário.
8. No SAML-D, operações entre localizações bancárias diferentes apresentam taxa positiva aproximadamente 4,09 vezes maior que operações na mesma localização; trata-se de associação do dataset sintético, não de regra de risco real.
9. A análise de contas revela concentração de movimentações e grande assimetria na quantidade de contrapartes. Frequência e repetição não comprovam suspeita.
10. A análise temporal encontra variações por hora, dia da semana, dia e mês. Os timestamps são tratados em UTC+00:00, e os meses inicial e final são parciais.
11. `Laundering_type` apresenta correspondência perfeita com o rótulo no conjunto analisado e representa risco de vazamento se usada como atributo preditivo.
12. Por ser sintético, o SAML-D permite desenvolver e comparar métodos, mas não garante desempenho equivalente em dados bancários reais.

## 14. Limitações e cuidados para a apresentação

- **Dados sintéticos:** os padrões refletem a construção do SAML-D e não necessariamente a distribuição do sistema bancário real.
- **Desbalanceamento:** a classe positiva é muito rara; métricas agregadas, especialmente acurácia, podem ser enganosas.
- **Moedas:** a documentação técnica define `Amount` como padronizada em GBP. Os notebooks não fazem uma conversão adicional; `Payment_currency` e `Received_currency` permanecem variáveis categóricas descritivas.
- **Localizações:** taxas por país não devem ser interpretadas como uma classificação real de risco geográfico.
- **Contas e redes:** alta recorrência, concentração ou diversidade de contrapartes não significa fraude. Os indicadores agregados não representam uma classificação independente de risco por conta.
- **Tipologias:** a correspondência perfeita de `Laundering_type` com `Is_laundering` impede seu uso ingênuo como entrada preditiva.
- **Temporalidade:** os gráficos por hora, dia da semana e mês descrevem o dataset observado; não comprovam sazonalidade recorrente nem substituem uma análise de sequências e intervalos entre transações.
- **Validação:** estatísticas calculadas sobre o dataset completo são descritivas. Decisões de modelagem e transformações devem respeitar a separação entre treino, validação e teste para evitar vazamento entre conjuntos.

### 14.1 Ajustes recomendados no notebook antes da apresentação

1. Corrigir o título do gráfico de `Receiver_bank_location`, que atualmente menciona a localização do remetente.
2. Corrigir o rótulo do eixo X desse gráfico: atualmente aparece “Modalidade de pagamento”, embora a variável representada seja localização do destinatário.
3. Ajustar a verificação de valores infinitos para `np.isinf(dataset["Amount"]).any()`.
4. Deixar explícito nos gráficos baseados em amostra que foram usadas todas as observações positivas e 100.000 negativas.
5. Explicar que as contas mais recorrentes e os pares mais frequentes não foram necessariamente classificados como suspeitos.
6. Garantir que `Laundering_type` não entre no conjunto de atributos do classificador.
7. Identificar explicitamente o fuso UTC+00:00 nos gráficos temporais e apresentações.
8. Revisar o aviso de depreciação do Pandas e, se aplicável à versão instalada, substituir `.dt.dayofweek` por `.dt.day_of_week`.
9. Ao comparar meses, sinalizar que outubro/2022 e agosto/2023 são períodos parciais.
10. Ao apresentar indicadores de contas e contrapartes, explicar que são estatísticas descritivas e não uma lista de contas suspeitas.

## 15. Relação entre a EDA e o restante do FraudRadar

A análise exploratória orienta o restante do projeto:

- o desbalanceamento justifica avaliar precisão, recall, F1-score e PR-AUC, em vez de depender da acurácia;
- as diferenças de escala e a distribuição de `Amount` motivam avaliar transformações e escalonamento quando adequados ao modelo;
- as variáveis categóricas precisam ser codificadas para modelos que não aceitam texto diretamente;
- a relação entre `Laundering_type` e `Is_laundering` alerta para a exclusão de uma variável que revelaria o alvo;
- a dimensão temporal do dataset sustenta a avaliação em períodos posteriores aos dados de treinamento, conforme a estratégia documentada no material de Machine Learning.

O notebook complementar avança, depois da EDA, para uma representação temporal por eventos de conta e experimentos com janelas de sequência e LightGBM. Essa parte já pertence à etapa de engenharia de atributos e modelagem, não à EDA em sentido estrito. Os resultados de treinamento, validação, escolha de limiar, métricas de classificação, curvas de aprendizado e importância de atributos devem permanecer no relatório de Machine Learning, evitando misturar estatísticas descritivas do dataset com resultados de desempenho do modelo.

A EDA não escolhe automaticamente o melhor modelo. Ela fornece evidências para formular hipóteses, preparar os dados e selecionar estratégias de avaliação coerentes com o problema.

## 16. Referências do projeto

- Notebook de análise exploratória original: `analysis(2).ipynb`.
- Notebook complementar da equipe (EDA adicional e, posteriormente, experimentos de modelagem): `FraudRadar_LightGBM(1).ipynb`.
- Documento de dataset e resultados de Machine Learning: `SAML-D(1).md`.
- Dataset SAML-D no Kaggle: [https://www.kaggle.com/datasets/berkanoztas/synthetic-transaction-monitoring-dataset-aml/data](https://www.kaggle.com/datasets/berkanoztas/synthetic-transaction-monitoring-dataset-aml/data).
- Documentação técnica do dataset, Appendix B — B.1 (definição das colunas, incluindo `Amount` padronizada em GBP e horário UTC+00:00): [https://www.aifirm.it/wp-content/uploads/2025/08/RMM-2025-02.pdf](https://www.aifirm.it/wp-content/uploads/2025/08/RMM-2025-02.pdf).

**Escopo desta versão:** as estatísticas e figuras novas foram acrescentadas a partir das células exploratórias do notebook complementar. Os experimentos de LightGBM e demais métricas de classificação não foram incorporados nesta EDA; devem ser consultados no documento de Machine Learning.
