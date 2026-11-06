"""A semana de cada conta em números: os totais e os países do alerta e os sinais semanais
(`evidence.weekly_signals`).

Aqui as contas são as gravadas no banco, sem o CAIXA: são as mesmas transações que a API lista
nas movimentações e no grafo do alerta, e `transaction_count` é o total dessa lista. Cada
transação conta uma vez por conta (a autotransferência também). O CAIXA só vale para o score e
a fila (`worker.queue`), como no modelo.

Não é variável do modelo: nada daqui entra no score.
"""

import numpy as np
import pandas as pd

from fraudradar.features.history import CASH_ACCOUNT, CASH_PAYMENT_TYPES


def cents(amount) -> np.ndarray:
    """Valor em centavos (inteiro), para somar sem erro de ponto flutuante."""
    return np.rint(np.asarray(amount, dtype="float64") * 100).astype("int64")


def _sides(tx: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por lado de cada transação: `account`, `counterparty`, `row` (posição em `tx`)
    e `sent` (True para quem enviou)."""
    n = len(tx)
    rows = np.arange(n)
    sender, receiver = tx["sender"].to_numpy(), tx["receiver"].to_numpy()
    sides = pd.DataFrame(
        {
            "account": np.concatenate([sender, receiver]),
            "counterparty": np.concatenate([receiver, sender]),
            "row": np.concatenate([rows, rows]),
            "sent": np.concatenate([np.ones(n, dtype=bool), np.zeros(n, dtype=bool)]),
        }
    )
    return sides[sides["account"] != CASH_ACCOUNT]


def _country_amounts(tx: pd.DataFrame, once: pd.DataFrame) -> pd.DataFrame:
    """(conta, país, centavos): o valor das transações da conta em que o país aparece (como
    origem ou destino; a transação doméstica conta uma vez), do país com mais valor para o com
    menos, empate em ordem alfabética."""
    rows = once["row"].to_numpy()
    value = cents(tx["amount"])[rows]
    sender_country = tx["sender_country"].astype(str).to_numpy()[rows]
    receiver_country = tx["receiver_country"].astype(str).to_numpy()[rows]
    account = once["account"].to_numpy()
    long = pd.DataFrame(
        {
            "account": np.concatenate([account, account]),
            "row": np.concatenate([rows, rows]),
            "country": np.concatenate([sender_country, receiver_country]),
            "cents": np.concatenate([value, value]),
        }
    ).drop_duplicates(["account", "row", "country"])
    amounts = long.groupby(["account", "country"], as_index=False)["cents"].sum()
    return amounts.sort_values(["account", "cents", "country"], ascending=[True, False, True])


def account_summary(tx: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por conta com transação em `tx` (as da semana), com índice `account`:

    - `transaction_count` e `total_cents`: as transações enviadas e recebidas e o valor somado,
      em centavos;
    - `sent_count`, `received_count`, `sent_cents`, `received_cents`: cada lado (a
      autotransferência entra nos dois);
    - `distinct_counterparties`: outras contas com quem transacionou;
    - `cash_share`: fração das transações em espécie (`CASH_PAYMENT_TYPES`);
    - `cross_border_share`: fração com países diferentes de origem e destino;
    - `main_country`: o país com mais valor movimentado (o primeiro de `countries`).
    """
    sides = _sides(tx)
    sides = sides.assign(cents=cents(tx["amount"])[sides["row"].to_numpy()])
    once = sides.drop_duplicates(["account", "row"])
    payment = tx["payment_type"].astype(str).to_numpy()
    countries_differ = (
        tx["sender_country"].astype(str).to_numpy() != tx["receiver_country"].astype(str).to_numpy()
    )
    rows = once["row"].to_numpy()
    once = once.assign(
        cash=np.isin(payment, CASH_PAYMENT_TYPES)[rows], cross_border=countries_differ[rows]
    )
    by_account = once.groupby("account")
    sent = sides[sides["sent"]].groupby("account")
    received = sides[~sides["sent"]].groupby("account")
    others = sides[sides["counterparty"] != sides["account"]]
    summary = pd.DataFrame(
        {
            "transaction_count": by_account.size(),
            "total_cents": by_account["cents"].sum(),
            "sent_count": sent.size(),
            "received_count": received.size(),
            "sent_cents": sent["cents"].sum(),
            "received_cents": received["cents"].sum(),
            "distinct_counterparties": others.groupby("account")["counterparty"].nunique(),
            "cash_share": by_account["cash"].mean(),
            "cross_border_share": by_account["cross_border"].mean(),
        }
    )
    counts = summary.columns.difference(["cash_share", "cross_border_share"])
    summary[counts] = summary[counts].fillna(0).astype("int64")
    main = _country_amounts(tx, once).drop_duplicates("account").set_index("account")["country"]
    summary["main_country"] = main
    return summary.rename_axis("account")


def countries(tx: pd.DataFrame, accounts) -> dict[int, list[str]]:
    """Os países de cada conta pedida, do que mais movimentou valor para o que menos, sem
    repetir (`alerts.countries`; o primeiro é o que a fila mostra)."""
    sides = _sides(tx)
    once = sides[sides["account"].isin(list(accounts))].drop_duplicates(["account", "row"])
    amounts = _country_amounts(tx, once)
    return {int(a): list(c) for a, c in amounts.groupby("account", sort=False)["country"]}


def payment_types(tx: pd.DataFrame) -> pd.DataFrame:
    """(account, payment_type) sem repetir: os meios de pagamento que cada conta usou."""
    sides = _sides(tx)
    rows = sides["row"].to_numpy()
    pairs = pd.DataFrame(
        {
            "account": sides["account"].to_numpy(),
            "payment_type": tx["payment_type"].astype(str).to_numpy()[rows],
        }
    )
    return pairs.drop_duplicates(ignore_index=True)


def weekly_signals(row) -> dict:
    """Os sinais semanais de uma linha de `account_summary`, como vão para o JSON."""
    return {
        "sent_count": int(row["sent_count"]),
        "received_count": int(row["received_count"]),
        "sent_amount": int(row["sent_cents"]) / 100,
        "received_amount": int(row["received_cents"]) / 100,
        "distinct_counterparties": int(row["distinct_counterparties"]),
        "cash_share": round(float(row["cash_share"]), 4),
        "cross_border_share": round(float(row["cross_border_share"]), 4),
    }
