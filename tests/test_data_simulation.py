"""Simulador: ligações reais do histórico, datas depois da última, sem gabarito, e só o fan-out
cria pares novos."""

from datetime import datetime, timedelta

import pandas as pd

from fraudradar.data.simulation import SIMULATION_COLUMNS, simulate_transactions
from fraudradar.features.history import compute_features

EDGE = [
    "sender",
    "receiver",
    "payment_type",
    "payment_currency",
    "received_currency",
    "sender_country",
    "receiver_country",
]
# Pares fixos, cada um com o seu meio, moedas, países, valor típico e quantas vezes aparece
# no histórico. O depósito em espécie cobre o CAIXA (o outro lado vira a conta -1).
PAIRS = [
    (10, 20, "Credit card", "UK pounds", "UK pounds", "UK", "UK", 100.0, 30),
    (20, 30, "Cross-border", "UK pounds", "Euro", "UK", "Spain", 5000.0, 10),
    (30, 10, "Cash Deposit", "UK pounds", "UK pounds", "UK", "UK", 250.0, 5),
    (40, 50, "ACH", "UK pounds", "UK pounds", "UK", "UK", 40000.0, 1),
]
LAST = datetime(2026, 11, 10, 23, 0)
ACCOUNTS = list(range(10, 1010, 10))  # as do histórico e outras 95, que só o fan-out usa


def _history() -> pd.DataFrame:
    rows = []
    for sender, receiver, payment, sent, received, s_country, r_country, amount, count in PAIRS:
        for i in range(count):
            rows.append(
                {
                    "occurred_at": LAST - timedelta(hours=7 * i + sender),
                    "sender": sender,
                    "receiver": receiver,
                    "amount": amount * (1 + 0.02 * (i % 5)),
                    "payment_currency": sent,
                    "received_currency": received,
                    "sender_country": s_country,
                    "receiver_country": r_country,
                    "payment_type": payment,
                }
            )
    return pd.DataFrame(rows).sort_values("occurred_at", ignore_index=True)


def _simulate(**options) -> pd.DataFrame:
    return simulate_transactions(
        _history(), ACCOUNTS, **{"transactions": 600, "days": 3, "seed": 7, **options}
    )


def _edges(frame: pd.DataFrame) -> set[tuple]:
    return set(frame[EDGE].itertuples(index=False, name=None))


def test_simulation_comes_after_the_last_date_without_ground_truth():
    generated = _simulate(inject_pattern=True)

    assert list(generated.columns) == SIMULATION_COLUMNS
    assert len(generated) == 600
    assert generated["occurred_at"].min() > LAST
    assert generated["occurred_at"].dt.date.nunique() <= 3
    assert set(generated["sender"]) | set(generated["receiver"]) <= set(ACCOUNTS)
    assert not {"ground_truth", "Is_laundering", "Laundering_type"} & set(generated.columns)


def test_normal_traffic_repeats_real_pairs_with_their_attributes_and_amounts():
    history = _history()
    generated = _simulate(inject_pattern=False)

    # O par vem com o meio, as moedas e os países de uma transação real dele.
    assert _edges(generated) <= _edges(history)
    by_pair = history.groupby(["sender", "receiver"])["amount"]
    low, high = by_pair.min(), by_pair.max()
    for row in generated.itertuples():
        pair = (row.sender, row.receiver)
        assert 0.5 * low[pair] <= row.amount <= 2 * high[pair], pair
    # O par frequente sai mais (pesos 30, 10, 5 e 1 no histórico).
    drawn = generated.groupby(["sender", "receiver"]).size().sort_values(ascending=False)
    assert list(drawn.index) == [(10, 20), (20, 30), (30, 10), (40, 50)]


def test_without_the_pattern_no_simulated_transaction_has_a_new_counterparty():
    history = _history()
    generated = _simulate(inject_pattern=False)
    both = pd.concat([history, generated], ignore_index=True)
    both.insert(0, "id", range(len(both)))
    simulated_ids = both["id"].iloc[len(history) :]

    features = compute_features(both).set_index("id")
    new_share = features.loc[simulated_ids, "new_counterparty"].mean()

    assert new_share == 0.0


def test_only_the_injected_fan_out_creates_new_pairs():
    history = _history()
    generated = _simulate(inject_pattern=True)
    known = set(zip(history["sender"], history["receiver"], strict=True))
    pairs = list(zip(generated["sender"], generated["receiver"], strict=True))
    new = generated[[pair not in known for pair in pairs]]

    # 600 transações: o padrão ocupa 60 linhas (2 entradas e 58 saídas da conta central), e
    # todo par novo passa por ela.
    assert len(new) >= 50
    new_pairs = zip(new["sender"], new["receiver"], strict=True)
    (central,) = set.intersection(*({sender, receiver} for sender, receiver in new_pairs))
    assert new.loc[new["sender"] == central, "receiver"].nunique() >= 50
    assert _edges(generated[~generated.index.isin(new.index)]) <= _edges(history)
