# Contexto e orientações para implementar LSTM no SAML-D

> Documento de contexto para compartilhar com ChatGPT, Claude ou outra
> IA junto dos notebooks da equipe e do arquivo `SAML-D.md`.
>
> **Não é uma Skill operacional de Claude Code.** É um resumo de
> contexto, decisões e orientações técnicas, pronto para ser consultado
> por outra IA.

## 1. Contexto do projeto

Sou estudante de Engenharia de Software e participo de um
treinamento/estágio de Inteligência Artificial da TCS. Minha equipe
desenvolve um projeto acadêmico de identificação de transações bancárias
suspeitas, com possível aplicação em bancos, empresas de pagamento e
fintechs, para apresentar em uma banca final.

O projeto precisa demonstrar compreensão do dataset, análise
exploratória (EDA), pré-processamento, decisões de modelagem, avaliação
e limitações. O professor enfatizou gráficos, interpretação dos dados e
justificativas técnicas.

**Como me orientar:** não entregue apenas código pronto. Explique
conceitos, fluxo dos dados, dimensões, linhas importantes, premissas e
razões das decisões. Quero compreender e conseguir apresentar/defender a
implementação.

## 2. Dataset SAML-D

O dataset em estudo é o SAML-D, sintético, voltado a transações e
monitoramento de lavagem de dinheiro.

Estatísticas registradas em análises anteriores:

- Total aproximado: **9.504.852 transações**.
- Positivos (`Is_laundering = 1`): **9.873**.
- Classe 0: aproximadamente **99,8961%**.
- Classe 1: aproximadamente **0,1039%**.

Há forte desbalanceamento. Consulte o arquivo `SAML-D.md` e os notebooks
para confirmar os dados, nomes/semântica das colunas e resultados. Não
invente ou presuma informações ausentes.

### Partições cronológicas registradas

  Partição      Registros   Positivos   Proporção positiva

---

  Treino        6.653.396       6.764            0,101662%
  Validação     1.425.728       1.412            0,099037%
  Teste         1.425.728       1.697            0,119027%

Confirme esses números nos materiais atuais. Para dados transacionais, a
divisão cronológica tende a representar melhor a previsão de transações
futuras do que uma divisão aleatória.

## 3. Modelos tradicionais já avaliados

Modelos estudados: `DummyClassifier`, `LogisticRegression`,
`RandomForestClassifier` e `LightGBM`.

Resultados de validação cruzada registrados:

---

  Modelo               Precision       Recall           F1    PR-AUC/AP   Desvio-padrão
                                                                                     F1

---

  LightGBM              0,862924     0,657518     0,729346     0,716789        0,284833

  Random Forest         0,925000     0,196315     0,318983     0,582783        0,259566

  Logistic              0,009753     0,833488     0,019261     0,050841  não registrado
  Regression

DummyClassifier              0            0            0     0,001010  não registrado
--------------------------------------------------------------------------------------

Interpretação preliminar: - Dummy é o baseline; mostra por que acurácia
isolada é enganosa. - Logistic Regression apresentou recall alto e
precisão muito baixa, sugerindo muitos falsos positivos. - Random Forest
apresentou precisão alta e recall baixo. - LightGBM mostrou o melhor
equilíbrio geral nessa avaliação, mas com variação relevante entre
folds.

Resultados de teste registrados:

---

  Modelo                Accuracy    Precision       Recall             F1       PR-AUC

---

  LightGBM                0,9997        0,901       0,8362         0,8674       0,9200

  Random Forest           0,9993        0,710       0,7560         0,7323       0,7396

  Logistic                0,9988        0,480       0,1131        0,01831          não
  Regression                                                 (registrado)   registrado

DummyClassifier         0,9988            0            0              0       0,0012
------------------------------------------------------------------------------------

**Inconsistência a verificar:** precision 0,480 e recall 0,1131 não
resultam em F1 0,01831; o cálculo fica próximo de 0,1831. Confira o
notebook original, sem corrigir silenciosamente.

Também houve preocupação com seleção de modelo usando métricas do teste.
A escolha de modelo, hiperparâmetros e threshold deve ocorrer com
treino/validação/CV. O teste deve ficar reservado para avaliação final;
uso repetido do teste para escolher modelos contamina a estimativa
final.

Esses resultados são referências anteriores, não garantias nem
comparação automaticamente justa com a LSTM. Confirme se as partições e
registros-alvo são equivalentes.

## 4. Objetivo da LSTM

A LSTM (Long Short-Term Memory) é uma rede recorrente que processa
sequências e mantém um estado interno ao longo dos passos temporais.

Hipótese do experimento: o histórico de transações relacionadas a uma
entidade pode fornecer contexto para classificar uma transação, em vez
de analisar cada transação isoladamente.

Isso é uma hipótese a testar. Não presuma que LSTM será melhor que
LightGBM. Um resultado inferior também é válido se a metodologia for
correta.

## 5. Construção das sequências

O professor sugeriu organizar transações em sequências de tamanho fixo,
mas **não definiu** tamanho, intervalo temporal, número de janelas ou
identificador para agrupamento. Esses pontos devem ser investigados, não
apresentados como exigências do professor.

### 5.1 Rótulo da sequência

Recomendação inicial: classificar a **última transação** da sequência.

Exemplo com cinco transações:

- Entrada: atributos de `[T1, T2, T3, T4, T5]`.
- Alvo: `Is_laundering` de `T5`.

Formalmente:

`X = [T(t-L+1), ..., T(t)]`

`y = Is_laundering(T(t))`

em que `L` é o tamanho da sequência.

Não marque a janela inteira como positiva apenas porque qualquer
transação dentro dela é positiva. Isso muda a pergunta que o modelo
aprende e pode não corresponder à classificação por transação.

### 5.2 Tamanhos iniciais

Compare, como hipótese experimental, sequências de **5, 10 e 20
transações**. São valores iniciais sugeridos, não requisitos. Observe
número de janelas, proporção de positivos, custo computacional e
desempenho.

### 5.3 Agrupamento por entidade

Inspecione as colunas para identificar possíveis IDs de conta de origem,
cliente, remetente ou outra entidade adequada.

Se houver identificador válido, avalie criar sequências dentro de cada
entidade. Não misture transações de contas diferentes
indiscriminadamente numa única sequência: isso pode criar um histórico
artificial.

Se não houver ID adequado, uma sequência global cronológica pode ser
avaliada como alternativa experimental, mas é semanticamente mais fraca
e exige justificativa. Não invente significado para colunas.

### 5.4 Ordenação e janelas deslizantes

Confirme as colunas de data/hora, combine-as corretamente se necessário
e ordene os registros. Não presuma que a ordem original do arquivo seja
cronológica. Investigue timestamps ausentes, inválidos ou iguais.

Janelas com stride 1 se sobrepõem. Exemplo: - janela 1: T1--T5; - janela
2: T2--T6.

Isso é possível, mas o mesmo registro-alvo não pode aparecer em treino e
validação/teste. Defina primeiro os períodos das partições e construa os
exemplos respeitando as fronteiras temporais. Contexto histórico
anterior pode ser usado para prever um alvo futuro se estivesse
disponível naquele instante; não use informação futura nem rótulos
futuros.

## 6. Prevenção de data leakage

Prioridades obrigatórias:

1. Nunca inclua `Is_laundering` nos atributos de entrada.
2. Não use variáveis derivadas do rótulo ou que revelem a
   classificação.
3. Não use atributos que só estariam disponíveis depois da
   transação-alvo.
4. Não permita que o mesmo registro-alvo apareça em mais de uma
   partição.
5. Ajuste imputadores, encoders e scalers somente com treino; aplique
   os parâmetros em validação/teste.
6. Faça balanceamento somente no treino.
7. Não escolha arquitetura, hiperparâmetros ou threshold usando o
   teste.
8. Investigue IDs, timestamps e atributos que possam funcionar como
   atalhos artificiais.
9. Agregações históricas devem usar somente informações disponíveis até
   o instante do alvo.

Documente como cada risco foi investigado.

## 7. Desbalanceamento: sequência não significa balanceamento

A janela apenas organiza observações. Ela não balanceia automaticamente
as classes. A proporção positiva depende dos rótulos das últimas
transações de cada sequência.

Compare estratégias separadamente:

1. Baseline sem balanceamento.
2. Peso da classe positiva na loss, por exemplo `pos_weight` em
   `BCEWithLogitsLoss`.
3. Amostragem ponderada, por exemplo `WeightedRandomSampler`, apenas no
   treino.
4. Undersampling de negativos no treino, se houver justificativa.

Não balanceie validação ou teste: preserve a distribuição natural.

`BCEWithLogitsLoss` é apropriada para classificação binária com um logit
de saída. Ela combina sigmoid e binary cross-entropy de forma
numericamente estável. `pos_weight` aumenta a contribuição dos positivos
na loss. Pode elevar recall, mas também falsos positivos; calcule o peso
usando somente treino e avalie o efeito.

Evite SMOTE diretamente em sequências sem justificativa forte:
interpolar sequências pode gerar exemplos artificiais sem coerência
temporal.

## 8. Implementação PyTorch

Formato esperado da entrada:

`(batch_size, sequence_length, num_features)`

- `batch_size`: sequências por lote;
- `sequence_length`: transações por sequência;
- `num_features`: atributos de cada transação.

Comece com arquitetura pequena: 1. camada LSTM; 2. representação do
último passo temporal (ou outra estratégia justificada); 3. camada
linear que produz um logit; 4. `BCEWithLogitsLoss`.

Defina e justifique unidades ocultas, camadas, dropout e
hiperparâmetros. Não comece com uma arquitetura complexa sem baseline.

### Memória e eficiência

O SAML-D tem milhões de linhas. Não materialize todas as janelas em RAM
sem estimar o consumo. Investigue `torch.utils.data.Dataset` e
`DataLoader` para gerar/acessar janelas sob demanda (lazy/on-the-fly),
ou outra solução eficiente.

Comece com uma amostra pequena e valide: - dimensões dos tensores; -
rótulos; - ordenação; - ausência de leakage; - uso de memória e tempo.

### Pré-processamento

Inspecione as colunas e notebooks antes de definir o pipeline. Separe
variáveis numéricas/categóricas, trate ausentes se existirem, codifique
categóricas quando necessário e escale atributos numéricos quando
apropriado. Ajuste transformações apenas no treino. Preserve a mesma
ordem de atributos entre partições. Não replique automaticamente o
pipeline dos modelos de árvore: explique as diferenças necessárias para
a rede neural.

## 9. Avaliação

Com classes tão desbalanceadas, acurácia não deve ser a métrica
principal. Um modelo que prevê quase tudo como classe 0 pode obter
acurácia alta e não detectar positivos.

Priorize: - **Precision:** proporção de sinalizações positivas que são
realmente positivas. - **Recall:** proporção dos positivos reais que
foram detectados. - **F1:** média harmônica de precision e recall. -
**Average Precision (AP) / PR-AUC:** sumariza o compromisso
precision-recall em thresholds diferentes. - **Matriz de confusão:** TP,
FP, TN e FN.

Se usar `sklearn.metrics.average_precision_score`, chame o resultado de
**Average Precision (AP)**. Não o descreva automaticamente como área
trapezoidal sob a curva PR: são sumarizações relacionadas, mas não
necessariamente idênticas.

Apresente também quantidade de positivos/negativos por partição,
métricas por período/fold, média e desvio-padrão quando aplicável,
curvas PR, loss de treino/validação, matriz de confusão e threshold
utilizado.

### Threshold

O threshold 0,5 não é necessariamente ideal. Escolha-o na validação
segundo critério explícito (por exemplo, maximizar F1 ou atingir recall
mínimo com precision aceitável). Congele a escolha e avalie uma única
vez no teste. Nunca otimize threshold no teste.

### Validação temporal e Cross-Validation

`KFold` divide os exemplos em folds; `StratifiedKFold` tenta preservar a
proporção de classes, mas **não balanceia o dataset** e não respeita
automaticamente a ordem temporal.

Para transações, uma validação aleatória pode permitir treino em
períodos posteriores aos de validação. Prefira treino em períodos
anteriores e validação em períodos posteriores, múltiplas janelas
temporais ou `TimeSeriesSplit`/folds customizados. Confira a quantidade
de positivos em cada fold: com cerca de 0,1% de positivos, alguns
períodos podem conter poucos casos e gerar métricas instáveis.

Não use CV aleatória como única evidência de generalização temporal.

## 10. Comparação justa com os modelos tradicionais

Compare com DummyClassifier, Logistic Regression, Random Forest e
LightGBM quando metodologicamente possível.

Procure manter os mesmos registros-alvo, partições temporais,
validação/teste, critério de threshold e métricas. Explique que modelos
tradicionais podem receber atributos tabulares de uma transação,
enquanto a LSTM recebe contexto sequencial. A comparação também
investiga se o histórico acrescenta informação útil.

Não conclua que LSTM é melhor apenas por ser uma rede neural.

## 11. EDA e gráficos sugeridos

Inclua visualizações úteis, acompanhadas de interpretação textual:

1. distribuição de classes dos alvos das sequências;
2. quantidade de sequências por tamanho;
3. distribuição temporal dos alvos positivos e negativos;
4. sequências por entidade, se houver ID adequado;
5. evolução da loss de treino e validação;
6. curva Precision-Recall;
7. matriz de confusão;
8. comparação de precision, recall, F1 e AP;
9. resultados por período/fold;
10. comparação final com modelos tradicionais.

Cada gráfico deve ter título, eixos e legenda quando necessária.
Explique o que mostra e o que não permite concluir.

## 12. Organização dos notebooks

Organização sugerida anteriormente:

- `analysis.ipynb`: EDA e pré-processamento;
- `model.ipynb`: modelos tradicionais;
- `03_sequencias_temporais_lstm.ipynb`: experimento separado de
  sequências e LSTM.

Não sobrescreva os notebooks anteriores sem necessidade. Estrutura
possível do novo notebook:

1. objetivo e hipótese;
2. leitura e inspeção dos dados;
3. auditoria de timestamps, IDs e alvo;
4. definição da sequência;
5. EDA das sequências;
6. divisão temporal e prevenção de leakage;
7. pré-processamento;
8. Dataset/DataLoader;
9. baseline sem balanceamento;
10. estratégias de balanceamento;
11. arquitetura e treinamento;
12. avaliação e threshold;
13. comparação de tamanhos;
14. comparação com modelos tradicionais;
15. limitações e conclusões.

## 13. Notebooks dos colegas e implementação própria

Dois colegas já possuem experimentos isolados de LSTM em subpastas
próprias dentro de `lab/` no repositório da equipe. Quero desenvolver
uma implementação própria com orientação, mas sem duplicar trabalho
desnecessariamente.

Antes de começar do zero, examine os notebooks dos colegas e
identifique: - como constroem sequências; - qual entidade agrupa
transações; - como ordenam os dados; - qual transação recebe o rótulo; -
como separam treino/validação/teste; - quais atributos e transformações
usam; - como tratam desbalanceamento; - arquitetura, loss, métricas e
resultados; - riscos de leakage e limitações; - componentes
reutilizáveis e lacunas.

Não copie código apenas porque executa. Explique-o e valide suas
premissas. Reutilize componentes corretos quando fizer sentido e
registre a origem/adaptações. Minha implementação deve ter propósito
claro: compreender as decisões, testar alternativas e documentar os
resultados.

## 14. Versionamento

Tenho um repositório pessoal para preservar estudos e histórico; a
equipe possui um repositório compartilhado com `lab/` para experimentos
individuais.

Mantenha propósitos distintos: - repositório pessoal: estudos, testes,
histórico e portfólio; - repositório da equipe: integração e fonte
compartilhada do projeto.

A recomendação é integrar incrementalmente no repositório da equipe, em
branch própria, em vez de esperar terminar tudo e copiar arquivos
manualmente. Exemplo de branch:

`experiment/lstm-sequences`

Pasta possível:

`lab/seu_experimento/`

Comandos ilustrativos (ajuste às regras do repositório):

```bash
git switch main
git pull origin main
git switch -c experiment/lstm-sequences
```

Depois, commits pequenos:

```bash
git add lab/seu_experimento/
git commit -m "feat: adiciona inspecao das sequencias"
git push -u origin experiment/lstm-sequences
```

Outras mensagens possíveis: - `feat: implementa construcao de janelas` -
`feat: adiciona avaliacao temporal` - `feat: implementa baseline LSTM` -
`feat: adiciona estrategias de balanceamento` -
`feat: adiciona metricas e visualizacoes`

Evite versionar datasets grandes, checkpoints pesados e arquivos
temporários sem necessidade. Use `.gitignore`; avalie Git LFS ou
armazenamento externo se necessário. Combine mudanças estruturais com a
equipe.

## 15. Limitações a declarar

- SAML-D é sintético; bom resultado não prova desempenho equivalente
  em bancos reais.
- Importância de variável não é causalidade nem prova de lavagem.
- O modelo pode aprender padrões artificiais do gerador do dataset.
- O desempenho pode variar por período, entidade e tipo de transação.
- Precision e recall representam compromissos diferentes, dependentes
  do custo operacional dos erros.
- Uma LSTM mais complexa não é necessariamente melhor.
- A definição das sequências determina o problema que o modelo
  aprende.
- O modelo deve ser descrito como ferramenta de sinalização para
  análise, não como decisão automática e definitiva de culpa.

## 16. Instruções para a IA que receber este documento

Atue como orientador técnico de Ciência de Dados e Engenharia de Machine
Learning, com postura didática e crítica.

1. Leia os arquivos relevantes antes de propor código.
2. Não invente colunas, resultados, estatísticas ou funcionalidades.
3. Separe fatos confirmados nos arquivos, inferências, recomendações e
   pontos ainda não verificados.
4. Aponte inconsistências sem resolvê-las silenciosamente.
5. Analise os notebooks dos colegas antes de recomendar uma terceira
   implementação.
6. Explique conceitos e decisões antes ou junto do código.
7. Ao propor código, explique entradas, saídas, dimensões, fluxo e
   riscos.
8. Prefira mudanças incrementais e células organizadas.
9. Não reescreva todo o projeto sem necessidade.
10. Não trate tamanho de janela, arquitetura ou balanceamento como
    requisitos definidos pelo professor.
11. Priorize prevenção de leakage, avaliação temporal e
    reprodutibilidade.
12. Não otimize métricas a qualquer custo; priorize experimento
    confiável e explicável.
13. Ajude-me a compreender e defender as decisões perante professor e
    equipe.

### Primeira tarefa recomendada

Antes de escrever a LSTM, examine `SAML-D.md` e os notebooks dos
colegas. Produza uma comparação estruturada cobrindo construção de
sequências, entidade, ordenação, alvo, partições, pré-processamento,
balanceamento, arquitetura, loss, métricas, gráficos, leakage,
limitações e componentes reutilizáveis.

Depois, proponha um plano incremental para
`03_sequencias_temporais_lstm.ipynb`. Não gere uma implementação
completa antes de confirmar as premissas dos dados e das sequências.

## 17. Checklist de qualidade

- [ ] Colunas, timestamps, IDs e alvo foram inspecionados.
- [ ] Agrupamento e ordenação foram justificados.
- [ ] O rótulo da sequência está claro.
- [ ] Tamanho da sequência é hipótese experimental.
- [ ] `Is_laundering` não está nos atributos de entrada.
- [ ] Não há informação futura.
- [ ] Um mesmo registro-alvo não aparece em mais de uma partição.
- [ ] Transformações foram ajustadas somente no treino.
- [ ] Balanceamento foi aplicado somente no treino.
- [ ] Validação e teste preservam distribuição natural.
- [ ] Avaliação temporal foi justificada.
- [ ] Precision, recall, F1, AP e matriz de confusão foram reportados.
- [ ] Threshold foi escolhido na validação.
- [ ] Comparação com baselines é justa.
- [ ] Gráficos têm interpretação textual.
- [ ] Limitações do dataset sintético foram explicitadas.
- [ ] Consigo explicar e defender o código e as decisões.
