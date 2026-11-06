"""A fila da semana a partir do score das transações, com a mesma conta da avaliação do modelo.

O score é o do booster (`booster.predict`) sobre `compute_features`, e a explicação é a de
`training.explain`: nada de variável ou score é calculado aqui. Este módulo só monta a entrada
na ordem da ficha e agrupa por conta como `fraudradar.model.evaluation.account_weeks`: cada conta
(depois do CAIXA, `with_cash_account`) fica com o maior score das transações que enviou ou
recebeu na semana, e o CAIXA nunca entra.
"""

import lightgbm as lgb
import numpy as np
import pandas as pd

from fraudradar.features.history import CASH_ACCOUNT
from fraudradar.model.training import explain


def model_input(features: pd.DataFrame, card: dict) -> tuple[pd.DataFrame, dict[str, int]]:
    """As variáveis do modelo na ordem de `card["features"]`, com as categorias exatas da
    ficha, na ordem dela.

    Valor que a ficha não conhece (ex.: um meio de pagamento novo vindo da ingestão) vira nulo,
    nunca categoria nova. Devolve também quantos valores viraram nulo em cada coluna.
    """
    x = features[card["features"]].copy()
    unknown = {}
    for column, categories in card["categories"].items():
        before = int(x[column].notna().sum())
        x[column] = x[column].astype("category").cat.set_categories(categories)
        unknown[column] = before - int(x[column].notna().sum())
    return x, unknown


def account_scores(sender: np.ndarray, receiver: np.ndarray, score: np.ndarray) -> pd.DataFrame:
    """Uma linha por conta (índice `account`, sem o CAIXA): `score`, o maior score das
    transações que ela enviou ou recebeu, e `row`, a posição da transação que deu esse score
    (no empate, a primeira na ordem do tempo).

    `sender` e `receiver` já com o CAIXA (`with_cash_account`), como na avaliação do modelo.
    """
    rows = np.arange(len(score))
    long = pd.DataFrame(
        {
            "account": np.concatenate([sender, receiver]),
            "score": np.concatenate([score, score]),
            "row": np.concatenate([rows, rows]),
        }
    )
    long = long[long["account"] != CASH_ACCOUNT]
    long = long.sort_values(["account", "score", "row"], ascending=[True, False, True])
    return long.drop_duplicates("account").set_index("account")[["score", "row"]]


def select_queue(accounts: pd.DataFrame, cut: float, size: int) -> pd.DataFrame:
    """A fila: as contas com score >= `cut`, da maior para a menor (empate: a conta menor
    primeiro), no máximo `size`. Colunas `account`, `score`, `row` e `queue_position` (1..n).

    É a fila de `evaluation.queue_with_cut`, a que deu os números da ficha.
    """
    above = accounts[accounts["score"] >= cut].reset_index()
    queue = above.sort_values(["score", "account"], ascending=[False, True]).head(size)
    queue = queue.reset_index(drop=True)
    return queue.assign(queue_position=np.arange(1, len(queue) + 1))


def contributions(booster: lgb.Booster, x: pd.DataFrame) -> list[dict[str, float]]:
    """A contribuição de cada variável do modelo ao score de cada linha de `x`, em log-odds
    (`training.explain`, o mesmo cálculo do SHAP), para `evidence.contributions`."""
    if x.empty:  # fila vazia: o LightGBM recusa predict sem linhas
        return []
    explained = explain(booster, x, top=x.shape[1])
    return [{r["feature"]: r["contribution"] for r in reasons} for reasons in explained]
