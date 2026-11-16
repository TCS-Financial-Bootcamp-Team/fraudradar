
# Atualização da apresentação — FraudRadar PLD

Quero que você atualize a apresentação atual do projeto FraudRadar PLD com base nas orientações abaixo. O objetivo é melhorar a parte visual e as falas, demonstrando à banca tanto o aprendizado adquirido durante os três meses da primeira fase do bootcamp de IA quanto a evolução dos experimentos realizados pela equipe.

**Importante:** preserve a identidade visual, o estilo e a organização geral da apresentação atual. Não refaça todos os slides desnecessariamente. Faça somente os ajustes necessários.

## 1. Slide 7 — Análise e preparação dos dados

Manter os gráficos de desbalanceamento das classes e divisão temporal dos dados.

### Gráfico 1 — Desbalanceamento das classes

- Mostrar a diferença entre transações normais e transações identificadas como lavagem de dinheiro.
- Corrigir qualquer referência a 10% de transações suspeitas: a proporção correta é aproximadamente 0,1% (cerca de 9.873 registros positivos em 9,5 milhões de transações).
- Destacar que a acurácia isoladamente não é adequada para avaliar o modelo nesse cenário.
- Relacionar o problema ao experimento com o DummyClassifier, que apresentou aproximadamente 99,9% de acurácia ao classificar todas as transações como normais.

A fala deve explicar naturalmente que aprendemos a importância de utilizar outras métricas, como precisão, recall e PR-AUC.

### Gráfico 2 — Divisão temporal

- Mostrar a sequência de treinamento, validação e teste.
- Respeitar as datas utilizadas no notebook do LightGBM 1:
  - Treinamento: antes de 19/05/2023.
  - Validação: de 19/05/2023 até antes de 06/07/2023.
  - Teste: a partir de 06/07/2023.
- Não inventar proporções de volume ou quantidade de transações.
- Explicar que os dados foram organizados cronologicamente para evitar que o modelo utilize informações futuras durante o treinamento.

## 2. Inserir um novo slide após o slide 7 — Experimentos iniciais de Yuji

Criar um slide específico para apresentar os experimentos que realizei individualmente durante o aprendizado de Machine Learning.

Título sugerido: **Experimentação e comparação de modelos**

Utilizar o gráfico de comparação das curvas Precision-Recall dos quatro modelos presentes no meu notebook:

- DummyClassifier;
- LogisticRegression;
- RandomForestClassifier;
- LightGBM versão 2.

O gráfico deve mostrar a diferença de comportamento entre os modelos, mantendo os dados e resultados originais do notebook. Não inventar valores ou reconstruir curvas com dados estimados.

A apresentação deve destacar os seguintes aprendizados:

- DummyClassifier: aproximadamente 99,9% de acurácia, mas não identificou as transações suspeitas.
- LogisticRegression: 90,72% de recall e apenas 1,03% de precisão na validação, demonstrando muitos falsos positivos.
- RandomForestClassifier: 79,03% de precisão e 48,58% de recall.
- LightGBM versão 2: melhor equilíbrio na comparação; 93,41% de recall na validação e, após o ajuste do limiar, 90,10% de precisão e 83,62% de recall no teste.

**Atenção:** não misturar resultados de validação com resultados de teste. Identificar claramente a etapa correspondente a cada métrica.

A fala deve ser natural e demonstrar o aprendizado adquirido: compreender o problema, testar diferentes modelos, identificar suas limitações e perceber que uma acurácia alta não significa necessariamente um bom modelo.

## 3. Slide 8 — Experimentos desenvolvidos pelo Vinicius

Manter a comparação dos cinco métodos desenvolvidos pelo Vinicius:

| Abordagem             | Resultado |
| --------------------- | --------: |
| Regras de cenário    |      2,4% |
| Isolation Forest      |      2,9% |
| Regressão Logística |     80,9% |
| GRU                   |     96,3% |
| LightGBM versão 1    |     96,5% |

Preservar a informação de que os valores representam a identificação de casos suspeitos na fila de 300 contas por semana, conforme a avaliação do experimento.

Não misturar esses resultados com as métricas dos meus experimentos. São avaliações diferentes, com unidades e condições distintas.

A fala deve explicar que o Vinicius explorou outras abordagens e que o LightGBM foi escolhido considerando não apenas o resultado, mas também fatores operacionais, como quantidade de falsos alertas, velocidade de treinamento e explicabilidade.

A apresentação dessa parte deve ficar sob responsabilidade do Vinicius.

## 4. Slide 9 — Importância das características

Manter o gráfico de importância das características do LightGBM escolhido para o sistema, desde que corresponda ao modelo final utilizado.

A fala deve explicar que o gráfico mostra quais características tiveram maior influência nas decisões do modelo.

Acrescentar a ressalva de que importância de uma característica não significa necessariamente causalidade.

Essa parte deve ser apresentada pelo Vinicius, caso o gráfico seja referente ao modelo que ele desenvolveu.

## 5. Organização das apresentações

Organizar as falas para que cada integrante apresente os experimentos que efetivamente realizou:

- **Yuji:** desbalanceamento, DummyClassifier, métricas de avaliação e experimentos com os quatro modelos.
- **Vinicius:** comparação das cinco abordagens, escolha do LightGBM versão 1 e importância das características.

Incluir uma transição natural entre as duas partes, por exemplo:

"Esses foram os experimentos que realizei para entender melhor o comportamento dos modelos de classificação. Paralelamente, o Vinicius também desenvolveu seus próprios testes, explorando outras abordagens e pensando na aplicação desses modelos dentro do nosso sistema."

Depois dessa transição, o Vinicius assume a apresentação.

## 6. Orientações gerais

- Manter as falas humanas, naturais e fáceis de apresentar, evitando excesso de termos técnicos.
- Não transformar os slides em textos longos. Priorizar gráficos, números importantes e explicações curtas.
- Utilizar os gráficos reais dos notebooks sempre que disponíveis.
- Não inventar métricas, resultados, datas ou características dos modelos.
- Diferenciar claramente os dois LightGBMs: versão 1, desenvolvida pelo Vinicius, e versão 2, desenvolvida por Yuji.
- Não afirmar que os dois LightGBMs foram comparados diretamente em condições equivalentes.
- Preservar a sequência lógica: análise dos dados → aprendizado e experimentação inicial → experimentos da equipe → escolha do modelo → resultados do sistema.

O resultado deve mostrar que a equipe não apenas implementou um modelo pronto, mas estudou o problema, experimentou diferentes técnicas de IA, interpretou resultados e tomou decisões fundamentadas para construir a solução FraudRadar PLD.
