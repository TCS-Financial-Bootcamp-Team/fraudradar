"""Variáveis do modelo: nada do futuro, contas feitas à mão, o CAIXA e a semana."""

import numpy as np
import pandas as pd
import pytest
from fake_saml_d import synthetic

from fraudradar.features import FEATURE_LABELS
from fraudradar.features.history import (
    CASH_ACCOUNT,
    CATEGORICAL,
    account_profile,
    compute_features,
    week_start,
    with_cash_account,
)


def _transactions(*rows):
    """Cada linha: (occurred_at, sender, receiver, amount). O resto fica fixo."""
    df = pd.DataFrame(rows, columns=["occurred_at", "sender", "receiver", "amount"])
    df["occurred_at"] = pd.to_datetime(df["occurred_at"])
    df.insert(0, "id", np.arange(len(df)))
    return df.assign(
        payment_currency="UK pounds",
        received_currency="UK pounds",
        sender_country="UK",
        receiver_country="UK",
        payment_type="ACH",
    )


def _by_id(features):
    return features.set_index("id").astype({c: str for c in CATEGORICAL})


def test_no_future():
    """Cortar o dado numa data não muda nenhuma variável das transações de antes do corte."""
    transactions, _ = synthetic()
    full = _by_id(compute_features(transactions))
    cut = _by_id(compute_features(transactions[transactions["occurred_at"] < "2023-05-01"]))
    assert len(cut) > 1000
    pd.testing.assert_frame_equal(full.loc[cut.index], cut)


def test_first_transaction_has_nan():
    f = _by_id(
        compute_features(
            _transactions(("2023-01-06 10:00", 1, 2, 100.0), ("2023-01-07 10:00", 1, 3, 300.0))
        )
    )
    assert np.isnan(f.loc[0, "sender_mean_amount"]) and np.isnan(f.loc[0, "sender_days_since_last"])
    assert f.loc[1, "sender_mean_amount"] == 100 and f.loc[1, "sender_days_since_last"] == 1
    assert f.loc[1, "sender_amount_ratio"] == 3


def test_7_day_window():
    f = _by_id(
        compute_features(
            _transactions(
                ("2023-01-01 10:00", 1, 2, 10.0),
                ("2023-01-04 10:00", 1, 3, 20.0),
                ("2023-01-10 10:00", 1, 2, 40.0),  # 9 dias depois da 1ª: ela já saiu da janela
            )
        )
    )
    assert f["sender_sent_count"].tolist() == [0, 1, 2]
    assert f["sender_sent_count_7d"].tolist() == [0, 1, 1]
    assert f["sender_sent_amount_7d"].tolist() == [0, 10, 20]


def test_same_time_is_not_past():
    f = _by_id(
        compute_features(
            _transactions(("2023-01-06 10:00", 1, 2, 10.0), ("2023-01-06 10:00", 1, 2, 20.0))
        )
    )
    assert f["sender_sent_count"].tolist() == [0, 0]
    assert f["new_counterparty"].tolist() == [1, 1]  # nenhuma das duas veio antes da outra
    assert f["sender_distinct_receivers"].tolist() == [0, 0]


def test_quick_pass_through():
    """A conta 2 recebe 1.000 e repassa 950 no dia seguinte."""
    f = _by_id(
        compute_features(
            _transactions(("2023-01-06 10:00", 1, 2, 1000.0), ("2023-01-07 10:00", 2, 3, 950.0))
        )
    )
    assert f.loc[1, "sender_received_amount_7d"] == 1000
    assert f.loc[1, "sender_out_in_ratio_7d"] == pytest.approx(0.95)
    assert f.loc[0, "receiver_sent_amount_7d"] == 0


def test_new_counterparties():
    f = _by_id(
        compute_features(
            _transactions(
                ("2023-01-06 10:00", 1, 9, 10.0),
                ("2023-01-06 11:00", 2, 9, 10.0),
                ("2023-01-06 12:00", 1, 9, 10.0),  # par repetido
                ("2023-01-06 13:00", 3, 9, 10.0),
            )
        )
    )
    assert f["new_counterparty"].tolist() == [1, 1, 0, 1]
    assert f["sender_distinct_receivers"].tolist() == [0, 0, 1, 0]
    assert f["sender_new_counterparty_share_7d"].tolist()[2] == 1
    assert f["receiver_distinct_senders"].tolist() == [0, 1, 2, 2]
    assert f["receiver_new_senders_7d"].tolist() == [0, 1, 2, 2]


def test_cash_has_no_account_on_the_other_side():
    """Em saque e depósito em espécie, o outro lado vira o CAIXA, e o histórico desse lado fica
    vazio. A tabela original não muda."""
    transactions, _ = synthetic()
    deposit = (transactions["payment_type"] == "Cash Deposit").to_numpy()
    withdrawal = (transactions["payment_type"] == "Cash Withdrawal").to_numpy()
    cash = with_cash_account(transactions)
    assert (cash["sender"][deposit] == CASH_ACCOUNT).all()
    assert (cash["receiver"][withdrawal] == CASH_ACCOUNT).all()
    assert (transactions["sender"] != CASH_ACCOUNT).all()
    f = compute_features(transactions).set_index("id").loc[transactions["id"]]
    assert f.loc[deposit, "sender_sent_count"].isna().all()
    assert f.loc[withdrawal, "receiver_received_count"].isna().all()
    assert f.loc[~deposit, "sender_sent_count"].notna().all()
    assert f.loc[~withdrawal, "receiver_received_count"].notna().all()


def test_account_profile():
    """Só entra a janela das 12 semanas; saque conta como espécie; o CAIXA não tem perfil."""
    t = _transactions(
        ("2022-12-01 10:00", 1, 2, 999.0),  # antes da janela
        ("2023-02-06 10:00", 1, 2, 100.0),
        ("2023-02-07 10:00", 1, 3, 300.0),
        ("2023-02-08 10:00", 2, 1, 50.0),
        ("2023-02-09 10:00", 1, 7, 40.0),  # saque: a conta 7 vira o CAIXA
    )
    t.loc[4, "payment_type"] = "Cash Withdrawal"
    p = account_profile(t, until="2023-03-01")
    assert p.loc[1, "sent_count"] == 3 and p.loc[1, "mean_sent_amount"] == pytest.approx(440 / 3)
    assert p.loc[1, "distinct_receivers"] == 3 and p.loc[1, "received_count"] == 1
    assert p.loc[1, "cash_share"] == 0.25
    assert p.loc[3, "sent_count"] == 0
    assert CASH_ACCOUNT not in p.index and 7 not in p.index


def test_week_starts_on_monday():
    # sexta, domingo (último minuto) e segunda
    dates = pd.Series(pd.to_datetime(["2022-10-07 00:00", "2022-10-09 23:59", "2022-10-10 00:00"]))
    starts = week_start(dates).dt.strftime("%Y-%m-%d").tolist()
    assert starts == ["2022-10-03", "2022-10-03", "2022-10-10"]


def test_every_feature_has_a_label():
    """Toda variável tem nome em português para o detalhe do alerta."""
    features = compute_features(_transactions(("2023-01-06 10:00", 1, 2, 10.0)))
    assert set(features.columns) - {"id"} == set(FEATURE_LABELS)
