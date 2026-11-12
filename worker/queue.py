"""A fila da semana a partir do score das transações, com a mesma conta da avaliação do modelo.

O score é o do booster (`booster.predict`) sobre `compute_features`, e a explicação é a de
`training.explain`: nada de variável ou score é calculado aqui. A entrada na ordem da ficha é
`fraudradar.model.scoring.model_input`; este módulo agrupa por conta como
`fraudradar.model.evaluation.account_weeks`: cada conta
(depois do CAIXA, `with_cash_account`) fica com o maior score das transações que enviou ou
recebeu na semana, e o CAIXA nunca entra.

A amostra de controle (`select_exploration`) é o contrário da fila: contas sorteadas FORA dela,
sem olhar a nota, para o analista revisar e o sistema medir o que o modelo deixa passar
(docs/analyst-feedback.md).
"""

import hashlib
from datetime import date

import lightgbm as lgb
import numpy as np
import pandas as pd

from fraudradar.features.history import CASH_ACCOUNT
from fraudradar.model.training import explain


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


def exploration_seed(dataset_slug: str, week: date) -> int:
    """A semente da amostra de controle de uma semana: sai do conjunto e da semana, nunca do
    relógio, para o recálculo do período aberto sortear as mesmas contas."""
    material = f"fraudradar.exploration|{dataset_slug}|{week.isoformat()}"
    return int.from_bytes(hashlib.sha256(material.encode()).digest()[:8], "big")


def _draw_keys(accounts: np.ndarray, seed: int) -> np.ndarray:
    """Um número de sorteio por conta, que só depende da conta e da semente (o misturador do
    SplitMix64, que nunca dá o mesmo número a duas contas). As operações em uint64 dão a volta
    no estouro, de propósito."""
    z = accounts.astype("uint64") ^ np.uint64(seed)
    z = z + np.uint64(0x9E3779B97F4A7C15)
    z = (z ^ (z >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
    z = (z ^ (z >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
    return z ^ (z >> np.uint64(31))


def select_exploration(
    accounts: pd.DataFrame, queue_accounts, size: int, seed: int, first_position: int
) -> pd.DataFrame:
    """A amostra de controle: `size` contas ativas que NÃO estão na fila, sorteadas com a mesma
    chance, sem olhar a nota. Mesmas colunas de `select_queue`; `queue_position` continua depois
    da fila (`first_position` em diante), da maior nota para a menor.

    `accounts` é a tabela de `account_scores` e `queue_accounts`, as contas de `select_queue`.
    Cada conta tem um número de sorteio fixo para a semente, e entram as `size` contas de menor
    número. Assim o recálculo do período aberto sorteia as mesmas contas: uma transação nova só
    troca uma conta da amostra se a conta dela tiver número menor, ou se uma conta sorteada
    passar para a fila.
    """
    outside = accounts[~accounts.index.isin(list(queue_accounts))].reset_index()
    outside = outside.assign(draw=_draw_keys(outside["account"].to_numpy(), seed))
    picked = outside.sort_values("draw").head(max(size, 0)).drop(columns="draw")
    picked = picked.sort_values(["score", "account"], ascending=[False, True])
    picked = picked.reset_index(drop=True)
    return picked.assign(queue_position=np.arange(first_position, first_position + len(picked)))


def contributions(booster: lgb.Booster, x: pd.DataFrame) -> list[dict[str, float]]:
    """A contribuição de cada variável do modelo ao score de cada linha de `x`, em log-odds
    (`training.explain`, o mesmo cálculo do SHAP), para `evidence.contributions`."""
    if x.empty:  # fila vazia: o LightGBM recusa predict sem linhas
        return []
    explained = explain(booster, x, top=x.shape[1])
    return [{r["feature"]: r["contribution"] for r in reasons} for reasons in explained]
