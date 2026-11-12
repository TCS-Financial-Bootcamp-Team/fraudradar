"""Transações enviadas pela API (POST /ingestion/*): ganham score no lote da semana delas, a
conta nova entra em `accounts` e o envio vai de received a completed."""

import pytest

pytest.importorskip("lightgbm")

from worker_helpers import FIRST_WEEK, TEST_WEEKS, rows, scalar  # noqa: E402

from worker.batch import run_batch  # noqa: E402

HEADER = (
    "Time,Date,Sender_account,Receiver_account,Amount,Payment_currency,Received_currency,"
    "Sender_bank_location,Receiver_bank_location,Payment_type"
)
NEW_ACCOUNT = 900001


def _upload(client, *lines: str) -> int:
    content = "\n".join([HEADER, *lines]).encode()
    response = client.post("/ingestion/csv", files={"file": ("envio.csv", content, "text/csv")})
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def _status(engine, ingestion_id: int) -> str:
    return scalar(engine, "SELECT status FROM ingestions WHERE id = :id", id=ingestion_id)


def test_upload_completes_when_all_its_weeks_are_processed(client, loaded, model_dir, no_rules):
    two_weeks = _upload(
        client,
        f"10:00:00,2023-05-23,{NEW_ACCOUNT},5,1500.00,UK pounds,UK pounds,UK,UK,ACH",
        f"11:30:00,2023-05-30,5,{NEW_ACCOUNT},250.50,UK pounds,Euro,UK,Spain,Cross-border",
    )
    one_week = _upload(client, "09:00:00,2023-05-24,7,8,99.99,UK pounds,UK pounds,UK,UK,Cheque")
    assert _status(loaded, two_weeks) == _status(loaded, one_week) == "received"

    run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=no_rules)
    assert _status(loaded, one_week) == "completed"
    assert _status(loaded, two_weeks) == "processing"  # falta a semana de 2023-05-29

    run_batch(loaded, TEST_WEEKS[1], model_dir=model_dir, rules_dir=no_rules)
    assert _status(loaded, two_weeks) == "completed"

    # as transações enviadas ganharam score, e a conta nova apareceu em accounts
    unscored = scalar(
        loaded,
        "SELECT count(*) FROM transactions t WHERE t.ingestion_id IS NOT NULL"
        " AND NOT EXISTS (SELECT 1 FROM transaction_scores s WHERE s.transaction_id = t.id)",
    )
    assert unscored == 0
    [account] = rows(
        loaded,
        "SELECT first_seen_at, last_seen_at FROM accounts WHERE account = :a",
        a=NEW_ACCOUNT,
    )
    assert str(account["first_seen_at"]) == "2023-05-23 10:00:00"
    assert str(account["last_seen_at"]) == "2023-05-30 11:30:00"


def test_uploaded_transactions_stay_out_of_the_metrics(client, loaded, model_dir, no_rules):
    """Sem gabarito, a transação enviada não entra em nenhum denominador: conta só com
    transação enviada pela API não conta como lavadora nem como conta da fila nas métricas."""
    run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=no_rules)
    before = scalar(loaded, "SELECT metrics FROM weekly_batches")
    big = "9999999.99"  # valor alto: as contas novas tendem a entrar na fila
    _upload(
        client,
        f"10:00:00,2023-05-23,{NEW_ACCOUNT},{NEW_ACCOUNT + 1},{big},UK pounds,UK pounds,UK,UK,ACH",
    )
    run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=no_rules, force=True)
    after = scalar(loaded, "SELECT metrics FROM weekly_batches")
    assert after["laundering_accounts"] == before["laundering_accounts"]
    labeled_in_queue = scalar(
        loaded,
        "SELECT count(*) FROM alerts a WHERE a.week = :week AND a.origin = 'model' AND EXISTS ("
        " SELECT 1 FROM transactions t JOIN ground_truth g ON g.transaction_id = t.id"
        " WHERE (t.sender = a.account OR t.receiver = a.account)"
        " AND t.occurred_at >= :week AND t.occurred_at < CAST(:week AS date) + 7)",
        week=FIRST_WEEK,
    )
    assert after["queue_size"] == labeled_in_queue
    in_queue = {
        r["account"] for r in rows(loaded, "SELECT account FROM alerts WHERE origin = 'model'")
    }
    if {NEW_ACCOUNT, NEW_ACCOUNT + 1} & in_queue:  # a conta nova está na fila e fora da métrica
        assert after["queue_size"] < len(in_queue)
