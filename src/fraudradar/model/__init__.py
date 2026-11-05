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
TARGET_FPR = 0.0013  # 0,13% de falso positivo, a régua do artigo do SAML-D
