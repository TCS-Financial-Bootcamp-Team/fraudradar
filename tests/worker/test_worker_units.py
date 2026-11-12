"""Peças do worker sem banco: a fila, o resumo da semana de cada conta e as métricas."""

import re
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("lightgbm")

from fraudradar.config import ROOT_DIR  # noqa: E402
from fraudradar.datasets import Dataset  # noqa: E402
from fraudradar.features.history import CASH_ACCOUNT  # noqa: E402
from fraudradar.model.evaluation import account_weeks  # noqa: E402
from fraudradar.model.scoring import model_input  # noqa: E402
from worker import batch as batch_module  # noqa: E402
from worker import metrics as metrics_module  # noqa: E402
from worker.metrics import compute_metrics  # noqa: E402
from worker.queue import account_scores, select_queue  # noqa: E402
from worker.summary import account_summary, countries, payment_types, weekly_signals  # noqa: E402
from worker.weeks import (  # noqa: E402
    first_out_of_sample_week,
    guards_training_period,
    monday,
    training_dataset,
)


def _tx(*rows) -> pd.DataFrame:
    """Transações de uma semana: (id, sender, receiver, amount, payment_type, de, para)."""
    frame = pd.DataFrame(
        rows,
        columns=[
            "id",
            "sender",
            "receiver",
            "amount",
            "payment_type",
            "sender_country",
            "receiver_country",
        ],
    )
    return frame.assign(occurred_at=pd.Timestamp("2023-05-22 10:00"))


# --- fila -----------------------------------------------------------------------------------


def test_queue_cut_size_and_ties():
    accounts = pd.DataFrame(
        {"score": [0.9, 0.5, 0.9, 0.7, 0.2], "row": [0, 1, 2, 3, 4]},
        index=pd.Index([30, 10, 20, 40, 50], name="account"),
    )
    queue = select_queue(accounts, cut=0.5, size=3)
    # empate em 0,9: a conta menor primeiro; 0,5 é igual ao corte e entraria, mas a fila é de 3
    assert queue["account"].tolist() == [20, 30, 40]
    assert queue["queue_position"].tolist() == [1, 2, 3]
    assert select_queue(accounts, cut=0.95, size=3).empty
    assert select_queue(accounts, cut=0.5, size=10)["account"].tolist() == [20, 30, 40, 10]


def test_account_score_is_the_max_of_sent_and_received_without_the_cash_account():
    sender = np.array([1, CASH_ACCOUNT, 2, 1])
    receiver = np.array([2, 1, CASH_ACCOUNT, 3])
    score = np.array([0.3, 0.8, 0.8, 0.1])
    best = account_scores(sender, receiver, score)
    assert best.index.tolist() == [1, 2, 3]
    assert best.loc[1].tolist() == [0.8, 1]  # recebeu o depósito em espécie (linha 1)
    assert best.loc[2].tolist() == [0.8, 2]
    assert best.loc[3].tolist() == [0.1, 3]
    # a mesma conta da avaliação do modelo
    expected = account_weeks(np.zeros(4), sender, receiver, score, np.zeros(4))["score"]
    assert expected.droplevel("week").to_dict() == best["score"].to_dict()


def test_account_score_tie_keeps_the_first_transaction():
    best = account_scores(np.array([5, 5]), np.array([6, 7]), np.array([0.4, 0.4]))
    assert best.loc[5, "row"] == 0


def test_model_input_uses_the_card_categories_in_order():
    features = pd.DataFrame(
        {
            "amount": [1.0, 2.0, 3.0],
            "payment_type": pd.Categorical(["Cheque", "Crypto", "ACH"]),
            "extra": [0, 0, 0],
        }
    )
    card = {
        "features": ["payment_type", "amount"],
        "categories": {"payment_type": ["ACH", "Cash Deposit", "Cheque"]},
    }
    x, unknown = model_input(features, card)
    assert x.columns.tolist() == ["payment_type", "amount"]
    assert x["payment_type"].cat.categories.tolist() == ["ACH", "Cash Deposit", "Cheque"]
    assert x["payment_type"].cat.codes.tolist() == [2, -1, 0]  # desconhecido vira nulo
    assert unknown == {"payment_type": 1}


# --- resumo da semana -----------------------------------------------------------------------------


def test_countries_by_amount_domestic_counted_once_ties_alphabetical():
    tx = _tx(
        (1, 10, 20, 100.0, "ACH", "UK", "UK"),
        (2, 10, 30, 60.0, "Cross-border", "UK", "Spain"),
        (3, 40, 10, 60.0, "Cross-border", "Mexico", "UK"),
    )
    # conta 10: UK em tudo (220); Spain 60 e Mexico 60, empate em ordem alfabética
    assert countries(tx, [10, 30]) == {10: ["UK", "Mexico", "Spain"], 30: ["Spain", "UK"]}
    assert account_summary(tx).loc[10, "main_country"] == "UK"


def test_summary_counts_self_transfer_once_and_shares():
    tx = _tx(
        (1, 10, 10, 50.0, "ACH", "UK", "UK"),  # autotransferência
        (2, 10, 20, 25.5, "Cash Withdrawal", "UK", "UK"),
        (3, 30, 10, 100.0, "Cross-border", "Spain", "UK"),
    )
    row = account_summary(tx).loc[10]
    assert row["transaction_count"] == 3 and row["total_cents"] == 17550
    signals = weekly_signals(row)
    assert signals == {
        "sent_count": 2,
        "received_count": 2,
        "sent_amount": 75.5,
        "received_amount": 150.0,
        "distinct_counterparties": 2,
        "cash_share": round(1 / 3, 4),
        "cross_border_share": round(1 / 3, 4),
    }


def test_payment_types_per_account():
    tx = _tx((1, 10, 20, 1.0, "ACH", "UK", "UK"), (2, 10, 20, 1.0, "ACH", "UK", "UK"))
    used = payment_types(tx).sort_values("account").to_dict("records")
    assert used == [
        {"account": 10, "payment_type": "ACH"},
        {"account": 20, "payment_type": "ACH"},
    ]


# --- métricas -------------------------------------------------------------------------------------


def test_metrics_follow_the_account_weeks_of_the_model(monkeypatch):
    monkeypatch.setattr(metrics_module, "MIN_COUNTRY_ACCOUNTS", 2)
    tx = _tx(
        (1, 1, 2, 10.0, "ACH", "UK", "UK"),  # lavagem: 1 e 2 são lavadoras
        (2, 3, 4, 10.0, "ACH", "UK", "UK"),
        # depósito em espécie de lavagem: quem "envia" é o CAIXA, só a 6 é lavadora
        (3, 5, 6, 10.0, "Cash Deposit", "Spain", "Spain"),
        (4, 7, 8, 10.0, "Cheque", "Spain", "Spain"),
        (5, 9, 1, 10.0, "ACH", "UK", "UK"),  # enviada pela API: sem gabarito
    )
    label = pd.Series([1, 0, 1, 0], index=[1, 2, 3, 4])
    result = compute_metrics(tx, label, queue={1, 3, 6, 9})
    # lavadoras: 1, 2, 6 (a 5 não: é o CAIXA). Na fila e com gabarito: 1, 3, 6 (a 9 só tem
    # transação sem gabarito e fica fora de todo denominador)
    assert result["laundering_accounts"] == 3 and result["queue_size"] == 3
    assert result["innocents_in_queue"] == 1
    assert result["recall"] == pytest.approx(2 / 3) and result["precision"] == pytest.approx(2 / 3)
    # ativas com gabarito: UK {1, 2, 3, 4}, Spain {6, 7, 8}
    assert result["country_rates"] == pytest.approx({"UK": 2 / 4, "Spain": 1 / 3})
    # ACH: {1, 2, 3, 4}; Cash Deposit: {5, 6}, mas a 5 é o lado do CAIXA e não é ativa;
    # Cheque: {7, 8}
    assert result["payment_type_rates"] == pytest.approx(
        {"ACH": 2 / 4, "Cash Deposit": 1.0, "Cheque": 0.0}
    )
    assert "typology_accuracy" not in result


def test_metrics_without_laundering_or_queue_are_null():
    tx = _tx((1, 1, 2, 10.0, "ACH", "UK", "UK"))
    result = compute_metrics(tx, pd.Series([0], index=[1]), queue=set())
    assert result["recall"] is None and result["precision"] is None
    assert result["country_rates"] == {}  # menos de 30 contas ativas no país


def test_metrics_of_a_week_with_only_uploaded_transactions():
    tx = _tx((1, 1, 2, 10.0, "ACH", "UK", "UK"))
    result = compute_metrics(tx, pd.Series([], dtype="int64"), queue={1})
    assert result["queue_size"] == result["laundering_accounts"] == 0
    assert result["payment_type_rates"] == {}


# --- semanas e o gabarito ---------------------------------------------------------------------


def test_week_helpers():
    assert first_out_of_sample_week({"train_end": "2023-05-21"}).isoformat() == "2023-05-22"
    assert first_out_of_sample_week({"train_end": "2023-05-22"}).isoformat() == "2023-05-29"
    assert monday(pd.Timestamp("2023-05-28").date()).isoformat() == "2023-05-22"


def test_training_period_guard_is_only_for_the_dataset_the_model_trained_on():
    official = {"training_dataset": "saml-d", "train_end": "2023-05-21"}
    legacy = {"train_end": "2023-05-21"}  # ficha de antes do campo: a do oficial
    retrained = {"training_dataset": "externa", "train_end": "2025-02-09"}

    assert training_dataset(legacy) == "saml-d"
    assert guards_training_period(official, "saml-d") and guards_training_period(legacy, "saml-d")
    assert not guards_training_period(official, "externa")
    assert not guards_training_period(legacy, "externa")
    assert guards_training_period(retrained, "externa")
    assert not guards_training_period(retrained, "saml-d")


def test_dataset_active_model_uses_its_own_folder(monkeypatch, tmp_path):
    selected = Dataset(
        slug="external-demo",
        name="Externa",
        schema_name="ds_external_demo",
        origin="external",
        active_model_version="external-demo/v2",
        created_at=datetime.now(UTC),
    )
    called = {}

    def fake_load_card(folder, version=None):
        called.update(folder=folder, version=version)
        return object(), {}

    monkeypatch.setattr(batch_module, "load_card", fake_load_card)
    _, card = batch_module._dataset_model(selected, tmp_path)
    assert called == {
        "folder": tmp_path / "external-demo",
        "version": "lightgbm_v2",
    }
    # Ficha de retreino sem training_dataset (gravada antes do campo): a pasta diz o conjunto.
    assert card["training_dataset"] == "external-demo"


def test_only_metrics_reads_ground_truth():
    """O gabarito só é lido em worker/metrics.py (métricas do lote), worker/labels.py (resumo do
    registro) e worker/simulate_analyst.py (o analista simulado decide por ele); o treino e o
    feedback-eval o leem pelo pacote do modelo (fraudradar.model.dataset_data)."""
    reads = re.compile(r"\b(FROM|JOIN)\s+ground_truth\b", re.IGNORECASE)
    readers = {
        path.name
        for path in Path(ROOT_DIR, "worker").glob("*.py")
        if reads.search(path.read_text(encoding="utf-8"))
    }
    assert readers == {"metrics.py", "labels.py", "simulate_analyst.py"}
