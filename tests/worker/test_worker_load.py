"""`worker load`: o SAML-D do CSV para transactions, ground_truth e accounts."""

import pandas as pd
import pytest

pytest.importorskip("lightgbm")

from worker_helpers import rows, scalar, write_saml_d_csv  # noqa: E402

from fraudradar.features.history import CASH_ACCOUNT  # noqa: E402
from worker.errors import WorkerError  # noqa: E402
from worker.load import load_saml_d  # noqa: E402


def test_transaction_id_is_the_csv_row_plus_one(loaded, saml_d):
    transactions, _ = saml_d
    db = pd.DataFrame(
        rows(
            loaded,
            "SELECT id, occurred_at, sender, receiver, amount, payment_currency,"
            " received_currency, sender_country, receiver_country, payment_type, ingestion_id"
            " FROM transactions ORDER BY id",
        )
    )
    assert db["id"].tolist() == list(range(1, len(transactions) + 1))
    assert db["ingestion_id"].isna().all()
    expected = transactions.assign(id=transactions["id"] + 1)
    for column in ["occurred_at", "sender", "receiver", "payment_type", "receiver_country"]:
        assert db[column].tolist() == expected[column].tolist(), column
    assert db["amount"].astype(float).tolist() == expected["amount"].tolist()


def test_ground_truth_lines_up_with_the_transactions(loaded, saml_d):
    _, ground_truth = saml_d
    db = pd.DataFrame(
        rows(loaded, "SELECT transaction_id, label, typology FROM ground_truth ORDER BY 1")
    )
    assert db["transaction_id"].tolist() == (ground_truth["transaction_id"] + 1).tolist()
    assert db["label"].tolist() == ground_truth["label"].tolist()
    assert db["typology"].tolist() == ground_truth["typology"].tolist()


def test_accounts_have_first_and_last_seen_and_never_the_cash_account(loaded, saml_d):
    transactions, _ = saml_d
    both = pd.concat(
        [
            transactions[["sender", "occurred_at"]].rename(columns={"sender": "account"}),
            transactions[["receiver", "occurred_at"]].rename(columns={"receiver": "account"}),
        ]
    )
    expected = both.groupby("account")["occurred_at"].agg(["min", "max"])
    db = pd.DataFrame(
        rows(loaded, "SELECT account, first_seen_at, last_seen_at, segment FROM accounts")
    ).set_index("account")
    assert sorted(db.index) == sorted(expected.index)
    assert CASH_ACCOUNT not in db.index
    assert (db["first_seen_at"] == expected.loc[db.index, "min"]).all()
    assert (db["last_seen_at"] == expected.loc[db.index, "max"]).all()
    assert db["segment"].isna().all()  # o segmento vem do lote


def test_identity_moves_past_the_largest_id(loaded, saml_d, seed):
    transactions, _ = saml_d
    new_id = seed.transaction(1, 2, pd.Timestamp("2023-08-01 10:00").to_pydatetime())
    assert new_id == len(transactions) + 1


def test_second_load_writes_nothing(loaded, saml_d_csv, saml_d):
    before = scalar(loaded, "SELECT count(*) FROM transactions")
    result = load_saml_d(loaded, saml_d_csv)
    assert result.already_loaded and result.transactions == before == len(saml_d[0])
    assert scalar(loaded, "SELECT count(*) FROM transactions") == before
    assert scalar(loaded, "SELECT count(*) FROM ground_truth") == before


def test_load_is_refused_when_the_api_already_wrote_transactions(db, saml_d_csv, seed):
    """Os ids do SAML-D (1..N) colidiriam com os da ingestão."""
    seed._exec("INSERT INTO ingestions (source, row_count, created_by) VALUES ('api', 1, 'Ana')")
    seed._exec(
        "INSERT INTO transactions (occurred_at, sender, receiver, amount, payment_currency,"
        " received_currency, sender_country, receiver_country, payment_type, ingestion_id)"
        " VALUES ('2023-06-01', 1, 2, 10, 'UK pounds', 'UK pounds', 'UK', 'UK', 'ACH', 1)"
    )
    with pytest.raises(WorkerError, match="enviadas pela API"):
        load_saml_d(db, saml_d_csv)
    assert scalar(db, "SELECT count(*) FROM transactions") == 1


def test_missing_csv_is_an_error(db, tmp_path):
    with pytest.raises(WorkerError, match="arquivo não encontrado"):
        load_saml_d(db, tmp_path / "nada.csv")


def test_amount_with_more_than_two_decimals_is_rounded_and_counted(db, saml_d, tmp_path):
    transactions, ground_truth = (frame.head(3).copy() for frame in saml_d)
    transactions.loc[0, "amount"] = 10753.26726981541  # como algumas linhas do SAML-D
    result = load_saml_d(db, write_saml_d_csv(transactions, ground_truth, tmp_path / "s.csv"))
    assert result.rounded_amounts == 1 and result.transactions == 3
    assert float(scalar(db, "SELECT amount FROM transactions WHERE id = 1")) == 10753.27
