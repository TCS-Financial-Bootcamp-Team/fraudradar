"""A régua: igual para qualquer modelo e sempre medida no período de teste.

`pr_auc_validation` é a única medida fora do teste: use-a para ajustar o modelo e só olhe o teste
no fim (ajustar pelo teste é colar na prova). Pelo mesmo motivo, todo corte (o do F1, o da fila e
o limiar de 0,13%) é escolhido na validação.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
)

from fraudradar.features.history import CASH_ACCOUNT
from fraudradar.model import QUEUE_SIZE, TARGET_FPR

if TYPE_CHECKING:
    from fraudradar.model.training import TrainingData


def find_shortcuts(
    x: pd.DataFrame, y: np.ndarray, train: np.ndarray, minimum: int = 20
) -> tuple[pd.DataFrame, np.ndarray]:
    """Regras simples que, no treino, só pegam lavagem: nenhuma transação normal e pelo menos
    `minimum` lavagens.

    Olha cada variável, no geral e dentro de cada meio de pagamento: categorias que só aparecem
    em lavagem e pontas ("acima do maior valor visto numa transação normal", "abaixo do menor").
    Num banco real nada é 100%: quando acontece, é o gerador do dado entregando a resposta.
    Devolve as regras e a máscara das transações, de todo o período, que caem em alguma delas.
    """
    payment = x["payment_type"].astype(str).to_numpy()
    rules, mask = [], np.zeros(len(x), dtype=bool)
    for name in ["any", *np.unique(payment)]:
        group = np.ones(len(x), dtype=bool) if name == "any" else payment == name
        normal, laundering = group & train & (y == 0), group & train & (y == 1)
        if not normal.any() or laundering.sum() < minimum:
            continue
        for column in x.columns:
            v = x[column]
            if v.dtype.name == "category":
                only_laundering = set(v[laundering].unique()) - set(v[normal].unique())
                candidates = [(f"= {c}", (v == c).to_numpy()) for c in only_laundering]
            else:
                high, low = v[normal].max(), v[normal].min()
                candidates = [
                    (f"> {high:.6g}", (v > high).to_numpy()),
                    (f"< {low:.6g}", (v < low).to_numpy()),
                ]
            for condition, inside in candidates:
                count = int((inside & laundering).sum())
                if count >= minimum:
                    rule = f"{column} {condition}"
                    rules.append({"payment_type": name, "rule": rule, "train_laundering": count})
                    mask |= group & inside
    return pd.DataFrame(rules), mask


def recall_at_fpr(y, score, fpr=TARGET_FPR) -> tuple[float, float]:
    """Fração das lavagens pegas quando só `fpr` das transações normais passam do limiar.

    Devolve (recall, limiar).
    """
    threshold = np.quantile(score[y == 0], 1 - fpr)
    return float((score[y == 1] > threshold).mean()), threshold


def best_f1_threshold(y, score) -> float:
    """O corte de score com o maior F1 (média harmônica de precisão e recall).

    Alerta = score >= corte.
    """
    precision, recall, cuts = precision_recall_curve(y, score)
    f1 = 2 * precision * recall / np.maximum(precision + recall, 1e-12)
    return float(cuts[np.argmax(f1[:-1])])


def account_weeks(week, sender, receiver, score, y) -> pd.DataFrame:
    """Uma linha por conta e semana: o maior score das transações da conta (enviou ou recebeu)
    e se ela participou de alguma transação de lavagem. O CAIXA não é cliente e fica de fora."""
    long = pd.DataFrame(
        {
            "week": np.tile(week, 2),
            "account": np.concatenate([sender, receiver]),
            "score": np.tile(score, 2),
            "y": np.tile(y, 2),
        }
    )
    long = long[long["account"] != CASH_ACCOUNT]
    return long.groupby(["week", "account"]).max()


def weekly_queue(
    accounts: pd.DataFrame, size: int = QUEUE_SIZE, cut: float = -np.inf
) -> tuple[float, float, float]:
    """A fila de cada semana: as `size` contas de maior score, só entre as de score >= `cut`.

    Devolve (recall, precisão, contas na fila por semana).
    """
    above = accounts[accounts["score"] >= cut]
    queue = above.sort_values("score", ascending=False, kind="stable").groupby(level="week")
    queue = queue.head(size)
    weeks = accounts.index.get_level_values("week").nunique()
    recall = float(queue["y"].sum() / accounts["y"].sum())
    return recall, float(queue["y"].mean()), len(queue) / weeks


def evaluate(score, data: TrainingData, truth: pd.DataFrame) -> tuple[dict, pd.Series]:
    """Métricas no teste, com e sem os atalhos do gerador, e o recall de cada tipologia.

    `recall_at_fpr_new_accounts` usa o mesmo limiar, só nas lavagens em que nenhuma conta lavou
    antes do teste: mostra se o modelo pega quem ele nunca viu lavar.
    """
    y, week = truth["y"].to_numpy(), truth["week"].to_numpy()
    shortcut = truth["shortcut"].to_numpy()
    te, clean, va = data.test, data.test & ~shortcut, data.validation
    new = te & (y == 1) & ~truth["known_account"].to_numpy()
    recall, threshold = recall_at_fpr(y[te], score[te])
    new_recall = float((score[new] > threshold).mean()) if new.any() else np.nan
    alert = score[te] >= best_f1_threshold(y[va], score[va])
    accounts = account_weeks(week[te], data.sender[te], data.receiver[te], score[te], y[te])
    queue_recall, queue_precision, _ = weekly_queue(accounts)
    clean_accounts = account_weeks(
        week[clean], data.sender[clean], data.receiver[clean], score[clean], y[clean]
    )
    laundering = te & (y == 1)
    by_typology = (
        pd.Series(score[laundering] > threshold, index=truth["typology"].to_numpy()[laundering])
        .groupby(level=0)
        .mean()
    )
    metrics = {
        "pr_auc_validation": average_precision_score(y[va], score[va]),
        "pr_auc": average_precision_score(y[te], score[te]),
        "recall_at_fpr": recall,
        "recall_at_fpr_no_shortcut": recall_at_fpr(y[clean], score[clean])[0],
        "recall_at_fpr_new_accounts": new_recall,
        "f1": f1_score(y[te], alert),
        "f1_precision": precision_score(y[te], alert, zero_division=0),
        "f1_recall": recall_score(y[te], alert),
        "queue_recall": queue_recall,
        "queue_precision": queue_precision,
        "queue_recall_no_shortcut": weekly_queue(clean_accounts)[0],
    }
    return metrics, by_typology


def queue_with_cut(
    score, data: TrainingData, truth: pd.DataFrame, targets=(0.99, 0.98, 0.97, 0.95)
) -> pd.DataFrame:
    """Em vez de sempre 300 contas, só entram as de score acima de um corte (até 300 por semana).

    O corte é escolhido na validação para manter `target` das contas lavadoras. Nas semanas com
    pouca lavagem a fila encolhe e sobram menos inocentes. O corte é o mesmo para todos, então
    não cria viés. A primeira linha (sem `target`) é a fila de 300 fixas.
    """
    y, week, va, te = truth["y"].to_numpy(), truth["week"].to_numpy(), data.validation, data.test
    val = account_weeks(week[va], data.sender[va], data.receiver[va], score[va], y[va])
    test = account_weeks(week[te], data.sender[te], data.receiver[te], score[te], y[te])
    rows = []
    for target in [None, *targets]:
        cut = (
            -np.inf if target is None else np.quantile(val.loc[val["y"] == 1, "score"], 1 - target)
        )
        recall, precision, per_week = weekly_queue(test, cut=cut)
        rows.append(
            {
                "target": np.nan if target is None else target,
                "cut": cut,
                "recall": recall,
                "precision": precision,
                "f1": 2 * precision * recall / max(precision + recall, 1e-12),
                "accounts_per_week": per_week,
                "innocents_per_week": per_week * (1 - precision),
            }
        )
    return pd.DataFrame(rows)


def false_positive_by_group(score, data: TrainingData, truth: pd.DataFrame) -> pd.DataFrame:
    """Taxa de falso positivo e recall por meio de pagamento e por país, no teste.

    O limiar é um só para todos (o de 0,13% de falso positivo, escolhido na validação). Um modelo
    enviesado teria grupos com taxa de falso positivo bem maior que os outros.
    """
    y, va, te = truth["y"].to_numpy(), data.validation, data.test
    threshold = recall_at_fpr(y[va], score[va])[1]
    t = truth[te].assign(normal=y[te] == 0, alert=score[te] > threshold)
    t["false_positive"], t["hit"] = t["alert"] & t["normal"], t["alert"] & ~t["normal"]
    parts = []
    for group in ["payment_type", "receiver_country", "sender_country"]:
        g = t.groupby(group).agg(
            normal=("normal", "sum"),
            false_positives=("false_positive", "sum"),
            laundering=("y", "sum"),
            hits=("hit", "sum"),
        )
        g = g.assign(
            fpr=g["false_positives"] / g["normal"], recall=g["hits"] / g["laundering"], group=group
        )
        parts.append(g.rename_axis("value").reset_index())
    return pd.concat(parts, ignore_index=True)
