"""Métricas da semana contra o gabarito, para `weekly_batches.metrics`.

É o único código do worker que lê `ground_truth`, e roda depois de a fila da semana estar
gravada: nada daqui volta para o score, a fila ou as evidências. Só contam as transações com
linha em `ground_truth`; as enviadas pela API não têm rótulo e ficam fora de todo denominador.

Conta-semana lavadora: alguma das suas transações tem `label = 1`, com as contas depois do
CAIXA, como em `fraudradar.model.evaluation.account_weeks`. Assim, somados todos os lotes do
período de teste, o recall e a precisão da fila são os da ficha (`queue_with_cut`).

A fila aqui é a do modelo (`alerts.origin = 'model'`). As contas da amostra de controle
(`exploration`) ficam de fora: elas não passaram do corte e entrariam como falso alerta.

Estas métricas são avaliação de desenvolvimento: ficam gravadas no lote, mas a API não as serve
às telas de operação, que só mostram o que os analistas confirmam (docs/analyst-feedback.md).
"""

from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import Connection, text

from fraudradar.features.history import CASH_ACCOUNT, with_cash_account
from worker.repository import week_window
from worker.summary import account_summary, payment_types

MIN_COUNTRY_ACCOUNTS = 30  # país com menos contas ativas na semana fica fora de country_rates


def week_metrics(conn: Connection, week: date, tx: pd.DataFrame) -> dict:
    """As métricas da semana. `tx`: as transações da semana (colunas de `transactions`)."""
    start, end = week_window(week)
    labels = conn.execute(
        text(
            "SELECT g.transaction_id, g.label FROM ground_truth g"
            " JOIN transactions t ON t.id = g.transaction_id"
            " WHERE t.occurred_at >= :start AND t.occurred_at < :end"
        ),
        {"start": start, "end": end},
    ).all()
    # Só a fila do modelo: a amostra de controle é sorteada fora dela e não é alerta.
    queue = conn.execute(
        text("SELECT account FROM alerts WHERE week = :week AND origin = 'model'"), {"week": week}
    ).scalars()
    label = pd.Series(
        [int(row.label) for row in labels], index=[int(row.transaction_id) for row in labels]
    )
    return compute_metrics(tx, label, set(queue))


def _rate(part: int, whole: int) -> float | None:
    """part / whole; None (null no JSON) quando não há denominador."""
    return part / whole if whole else None


def compute_metrics(tx: pd.DataFrame, label: pd.Series, queue: set[int]) -> dict:
    """`label`: rótulo por id de transação (só as que têm gabarito); `queue`: contas na fila.

    - recall: contas-semana lavadoras na fila / contas-semana lavadoras;
    - precision: contas-semana lavadoras na fila / contas-semana na fila;
    - laundering_accounts, queue_size, innocents_in_queue: as contagens por trás delas;
    - country_rates: por país, contas na fila / contas ativas, pelo país principal da conta (o
      primeiro de `countries`), só países com pelo menos MIN_COUNTRY_ACCOUNTS contas ativas;
    - payment_type_rates: por meio de pagamento, contas na fila / contas ativas que o usaram.
    """
    known = tx[tx["id"].isin(label.index)].reset_index(drop=True)
    y = label.reindex(known["id"]).to_numpy()
    cash = with_cash_account(known[["sender", "receiver", "payment_type"]])
    account_weeks = pd.DataFrame(
        {
            "account": np.concatenate([cash["sender"].to_numpy(), cash["receiver"].to_numpy()]),
            "y": np.concatenate([y, y]),
        }
    )
    account_weeks = account_weeks[account_weeks["account"] != CASH_ACCOUNT]
    laundering = account_weeks.groupby("account")["y"].max() == 1
    in_queue = pd.Series(laundering.index.isin(list(queue)), index=laundering.index)
    hits = int((laundering & in_queue).sum())
    queue_size = int(in_queue.sum())
    laundering_accounts = int(laundering.sum())

    main_country = account_summary(known)["main_country"].reindex(laundering.index)
    by_country = pd.DataFrame({"country": main_country, "in_queue": in_queue}).groupby("country")
    countries = by_country["in_queue"].agg(["size", "sum"])
    countries = countries[countries["size"] >= MIN_COUNTRY_ACCOUNTS]
    used = payment_types(known)
    used = used[used["account"].isin(laundering.index)]
    used = used.assign(in_queue=used["account"].isin(list(queue)))
    payments = used.groupby("payment_type")["in_queue"].agg(["size", "sum"])

    return {
        "recall": _rate(hits, laundering_accounts),
        "precision": _rate(hits, queue_size),
        "laundering_accounts": laundering_accounts,
        "queue_size": queue_size,
        "innocents_in_queue": queue_size - hits,
        "country_rates": {str(c): int(r["sum"]) / int(r["size"]) for c, r in countries.iterrows()},
        "payment_type_rates": {
            str(p): int(r["sum"]) / int(r["size"]) for p, r in payments.iterrows()
        },
    }
