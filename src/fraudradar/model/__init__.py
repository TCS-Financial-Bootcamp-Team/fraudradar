"""Modelo de score (LightGBM): treino, avaliação, fila semanal por conta, explicação e segmentos.

- `training.py`: monta a base com a divisão no tempo, treina o LightGBM oficial, grava e lê o
  modelo e explica cada score (a contribuição das variáveis, que alimenta `evidence`);
- `evaluation.py`: a régua (PR-AUC, recall com 0,13% de falso positivo, fila de 300 com corte,
  atalhos do gerador e falso positivo por grupo);
- `segments.py`: K-Means do perfil das contas (`accounts.segment`), fora do score;
- `check.py`: explica alertas sorteados da fila do teste, para conferir à mão;
- `python -m fraudradar.model train | check`: treina e grava uma versão nova; confere a mais nova.

Este arquivo guarda só a configuração, para importar sem o LightGBM: o CI e a imagem da API não
instalam o grupo `ml`.
"""

# Divisão no tempo (nunca embaralhar), em semanas inteiras de segunda a domingo.
TRAIN_END = "2023-05-21"  # domingo: treino até aqui (inclusive); teste depois
VALIDATION_START = "2023-04-24"  # segunda: as 4 últimas semanas do treino, para parar o treino
QUEUE_SIZE = 300  # contas por semana que o analista consegue revisar
QUEUE_TARGET = 0.95  # o corte da fila é escolhido na validação para manter 95% das lavadoras
MIN_LABELED_WEEKS = 6  # semanas com gabarito para o retreino ter treino, validação e teste
TARGET_FPR = 0.0013  # 0,13% de falso positivo, a régua do artigo do SAML-D
# Conjunto de dados do modelo oficial. A ficha diz em que conjunto o modelo treinou
# (`training_dataset`); ficha sem o campo é de antes dele e é a do oficial.
OFFICIAL_DATASET = "saml-d"

# Retorno dos analistas no retreino (docs/analyst-feedback.md).
# Rótulos de períodos fechados que o retreino com retorno exige: com menos, meia dúzia de decisões
# mudaria o peso de transações demais para o pouco que se sabe.
MIN_FEEDBACK_LABELS = 50
# Semanas com gabarito que sempre sobram depois do corte do treino, para a versão nova ter onde
# ser medida mesmo quando o retorno chega até o fim dos dados.
MIN_TEST_WEEKS = 4
# O analista decide por conta e semana; o modelo aprende por transação. A lavagem confirmada vale
# para as transações de maior nota da conta na semana, as que o analista viu como evidência.
FEEDBACK_POSITIVE_TOP = 5
# Peso, no treino, da transação com rótulo do analista que concorda com o gabarito: falso positivo
# confirmado é o caso difícil que o modelo errou; lavagem confirmada, o que ele não pode perder.
FEEDBACK_WEIGHT = 3.0
# Trava de promoção: a versão nova pode achar, no máximo, 1 ponto percentual a menos de contas
# lavadoras na fila que a versão ativa, no mesmo período de teste.
PROMOTION_RECALL_TOLERANCE = 0.01
