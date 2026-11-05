"""Conferência do modelo gravado: alertas sorteados da fila do teste, explicados, e os segmentos.

Lê o gabarito: é avaliação e nunca entra no worker.
"""

import numpy as np
import pandas as pd

from fraudradar.features.history import account_profile, compute_features
from fraudradar.model.evaluation import account_weeks, false_positive_by_group
from fraudradar.model.segments import assign_segments
from fraudradar.model.training import build_training_data, explain, load_model


def check_model(
    transactions: pd.DataFrame,
    ground_truth: pd.DataFrame,
    folder=None,
    launderers: int = 8,
    innocents: int = 2,
    seed: int = 0,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Confere a versão mais nova do modelo em `folder` (padrão: MODEL_DIR).

    1. Explica alertas sorteados da fila do teste (lavadoras e inocentes), para conferir à mão se
       as variáveis que mais pesaram combinam com o que aconteceu.
    2. Mostra cada segmento do K-Means: o perfil típico (mediana) e as taxas no teste.
    3. Mede o falso positivo por meio de pagamento e por país, com o limiar da validação.

    Devolve (alertas, segmentos, falso positivo por grupo).
    """
    booster, card = load_model(folder)
    data, truth = build_training_data(transactions, ground_truth, compute_features(transactions))
    x = data.x[card["features"]]
    score = booster.predict(x)
    y, week, te = truth["y"].to_numpy(), truth["week"].to_numpy(), data.test
    accounts = account_weeks(week[te], data.sender[te], data.receiver[te], score[te], y[te])
    queue = accounts[accounts["score"] >= card["queue_cut"]]
    queue = queue.sort_values("score", ascending=False, kind="stable")
    queue = queue.groupby(level="week").head(card["queue_size"])

    is_launderer = queue["y"] == 1
    sample = pd.concat(
        [
            queue[is_launderer].sample(min(launderers, int(is_launderer.sum())), random_state=seed),
            queue[~is_launderer].sample(
                min(innocents, int((~is_launderer).sum())), random_state=seed
            ),
        ]
    )
    rows = []
    for (w, account), alert in sample.iterrows():
        of_account = (data.sender == account) | (data.receiver == account)
        candidates = np.flatnonzero(te & (week == np.datetime64(w)) & of_account)
        i = max(candidates, key=lambda j: score[j])  # a transação que pôs a conta na fila
        reasons = explain(booster, x.iloc[[i]])[0]
        rows.append(
            {
                "week": w.date(),
                "account": account,
                "launderer": bool(alert["y"]),
                "score": alert["score"],
                "role": "sent" if data.sender[i] == account else "received",
                "payment_type": x["payment_type"].iat[i],
                "amount": x["amount"].iat[i],
                "typology": truth["typology"].iat[i],
                "reasons": "; ".join(
                    f"{r['feature']}={_short(r['value'])} ({r['contribution']:+.2f})"
                    for r in reasons
                ),
            }
        )

    until = pd.Timestamp(card["train_end"]) + pd.Timedelta(days=1)
    profiles = account_profile(transactions, until=until)
    segment = assign_segments(profiles, card["segments"])
    c = accounts.assign(in_queue=accounts.index.isin(queue.index)).reset_index()
    # -1: conta sem transação nas 12 semanas antes do teste
    c["segment"] = c["account"].map(segment).fillna(-1).astype(int)
    segments = c.groupby("segment").agg(
        account_weeks=("account", "size"), alert_rate=("in_queue", "mean")
    )
    segments["launderers"] = c.groupby("segment")["y"].mean()
    segments["false_positive"] = c[c["y"] == 0].groupby("segment")["in_queue"].mean()
    segments = segments.join(profiles.groupby(segment).median())
    segments = segments.join(segment.value_counts().rename("profile_accounts"))
    bias = false_positive_by_group(score, data, truth)
    return pd.DataFrame(rows), segments.reset_index(), bias


def _short(value) -> str:
    return f"{value:.4g}" if isinstance(value, int | float | np.number) else str(value)
