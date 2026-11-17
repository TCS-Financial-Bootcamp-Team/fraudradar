"""Leituras dos fatos da IA contra o banco de teste isolado."""

from datetime import date, datetime

from sqlalchemy import event, text

from api.alert_ai_service import prepare_alert_ai
from fraudradar.ai.alert_assessment import build_alert_chat_request

WEEK = date(2023, 6, 19)
ACCOUNT = 8865018891


def test_reads_active_cut_history_and_full_week_flow_without_truth_or_justification(db, seed):
    alert = seed.alert(ACCOUNT, WEEK, score=0.425, position=248)
    seed.alert(9912345678, WEEK, origin="exploration")
    earlier = seed.alert(ACCOUNT, date(2023, 6, 12), score=0.4, status="archived")
    seed.decision(
        earlier, "archive", archive_reason="false_positive", justification="Conta 5512345678"
    )
    seed.evidence(alert, contributions={"amount": 3.0, "hour": -1.0})
    seed.model("active-v2", active=False)
    with db.begin() as conn:
        conn.execute(text("UPDATE model_versions SET active = false"))
        conn.execute(
            text(
                "UPDATE model_versions SET active = true, threshold = 0.423 "
                "WHERE version = 'active-v2'"
            )
        )
        conn.execute(text("UPDATE accounts SET segment = 2 WHERE account = :a"), {"a": ACCOUNT})
    seed.transaction(
        5512345678,
        ACCOUNT,
        datetime(2023, 6, 20),
        amount=2000,
        sender_country="UK",
        receiver_country="FR",
        payment_type="Cash Deposit",
    )
    seed.transaction(
        ACCOUNT, 6612345678, datetime(2023, 6, 21), amount=500, payment_type="Transfer"
    )
    seed.transaction(ACCOUNT, 7712345678, datetime(2023, 6, 26), amount=9000)
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lower())

    event.listen(db, "before_cursor_execute", record)
    try:
        with db.begin() as conn:
            prepared = prepare_alert_ai(conn, alert)
    finally:
        event.remove(db, "before_cursor_execute", record)
    context = prepared.context
    assert context["queue_cut_0_to_100"] == 42.3
    assert context["distance_to_cut_pp"] == 0.2
    assert context["queue_position"] == 248
    assert context["queue_alert_count"] == 1
    assert context["active_model_version"] == "active-v2"
    assert context["alert_model_version"] == seed.VERSION
    assert context["segment_label"] == "Segmento K-Means 2"
    assert context["flow_shape"]["incoming_gbp"] == 2000.0
    assert context["flow_shape"]["outgoing_gbp"] == 500.0
    assert context["flow_shape"]["incoming_counterparties"] == 1
    assert context["flow_shape"]["outgoing_counterparties"] == 1
    assert context["flow_shape"]["cross_border_pct"] == 50.0
    assert context["flow_shape"]["cash_pct"] == 50.0
    assert context["flow_shape"]["round_amount_pct"] == 50.0
    assert context["account_history"][0]["archive_reason"] == "false_positive"
    assert context["prior_decisions"][0]["decision"] == "archive"
    assert context["model_contributions"][-1]["direction"] == "negative"
    assert "7712345678" not in prepared.forbidden_identifiers
    prompt = build_alert_chat_request(prepared, "Como avaliar?").prompt
    for identifier in (str(ACCOUNT), "5512345678", "6612345678"):
        assert identifier not in prompt
    for forbidden in ("ground_truth", "is_laundering", "laundering_type", "justification"):
        assert all(forbidden not in statement for statement in statements)


def test_no_evidence_no_active_model_and_no_segment_work(db, seed):
    alert = seed.alert(ACCOUNT, WEEK, origin="exploration")
    with db.begin() as conn:
        conn.execute(text("UPDATE model_versions SET active = false"))
        prepared = prepare_alert_ai(conn, alert)
    assert prepared.context["queue_cut_0_to_100"] is None
    assert prepared.context["queue_alert_count"] == 0
    assert prepared.context["model_contributions"] == []
    assert prepared.context["account_history"] == []
    assert "segment_label" not in prepared.context
    assert "flow_shape" not in prepared.context
    assert "Amostra de controle" in prepared.context["origin_description"]


def test_flow_and_identifier_guard_cover_movements_beyond_display_limit(db, seed):
    alert = seed.alert(ACCOUNT, WEEK, transaction_count=201)
    with db.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO transactions (sender, receiver, occurred_at, amount, payment_currency,
                received_currency, sender_country, receiver_country, payment_type)
            SELECT :account, 5000000000 + i, '2023-06-20'::timestamp, i,
                'Pound', 'Pound', 'UK', 'UK', 'Transfer' FROM generate_series(1, 201) AS i
        """),
            {"account": ACCOUNT},
        )
        prepared = prepare_alert_ai(conn, alert)
    assert prepared.context["observed_movements_in_sample"] == 200
    assert prepared.context["flow_shape"]["transaction_count"] == 201
    assert prepared.context["flow_shape"]["outgoing_counterparties"] == 201
    assert "5000000001" in prepared.forbidden_identifiers
    prompt = build_alert_chat_request(
        prepared, "Como avaliar?", history=[{"role": "user", "content": "Conta 5000000001"}]
    ).prompt
    assert "5000000001" not in prompt


def test_dataset_selected_version_takes_priority_over_last_processed_model(db, seed):
    alert = seed.alert(ACCOUNT, WEEK, score=0.425)
    seed.model("selected-v2", active=False)
    with db.begin() as conn:
        conn.execute(
            text("UPDATE model_versions SET threshold = 0.423 WHERE version = 'selected-v2'")
        )
        conn.execute(
            text(
                "UPDATE public.datasets SET active_model_version = 'selected-v2' "
                "WHERE slug = 'saml-d'"
            )
        )
        prepared = prepare_alert_ai(conn, alert)
    assert prepared.context["active_model_version"] == "selected-v2"
    assert prepared.context["queue_cut_0_to_100"] == 42.3
    assert prepared.context["alert_model_version"] == seed.VERSION
