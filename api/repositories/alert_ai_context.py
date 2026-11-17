"""Leituras adicionais para o contexto da IA, sem justificativas livres."""

from datetime import date
from typing import Any

from sqlalchemy import Connection, text

from api.repositories.alert_queue import week_window


def read_alert_ai_facts(
    conn: Connection, alert_id: int, account: int, week: date
) -> dict[str, Any]:
    """Lê somente dados operacionais no conjunto já selecionado pela rota."""
    model = (
        conn.execute(
            text(
                "WITH selected AS (SELECT coalesce("
                " (SELECT active_model_version FROM public.datasets"
                "  WHERE schema_name = current_schema()),"
                " (SELECT version FROM model_versions WHERE active)) AS version) "
                "SELECT a.model_version, selected.version, m.threshold FROM alerts a "
                "CROSS JOIN selected LEFT JOIN model_versions m ON m.version = selected.version "
                "WHERE a.id = :id"
            ),
            {"id": alert_id},
        )
        .mappings()
        .first()
    )
    queue_count = conn.execute(
        text("SELECT count(*) FROM alerts WHERE week = :week AND origin = 'model'"),
        {"week": week},
    ).scalar_one()
    raw_contributions = conn.execute(
        text("SELECT contributions FROM evidence WHERE alert_id = :id"), {"id": alert_id}
    ).scalar()
    segment = conn.execute(
        text("SELECT segment FROM accounts WHERE account = :account"), {"account": account}
    ).scalar()
    history = (
        conn.execute(
            text(
                "SELECT a.week, a.score, a.status, a.origin, d.decision, d.archive_reason "
                "FROM alerts a LEFT JOIN LATERAL ("
                " SELECT decision, archive_reason FROM decisions WHERE alert_id = a.id"
                " ORDER BY decided_at DESC, id DESC LIMIT 1"
                ") d ON true WHERE a.account = :account AND a.week < :week "
                "ORDER BY a.week DESC LIMIT 6"
            ),
            {"account": account, "week": week},
        )
        .mappings()
        .all()
    )
    decisions = (
        conn.execute(
            text(
                "SELECT a.week, d.decision, d.archive_reason FROM decisions d "
                "JOIN alerts a ON a.id = d.alert_id WHERE a.account = :account "
                "AND a.week <= :week ORDER BY d.decided_at DESC, d.id DESC LIMIT 6"
            ),
            {"account": account, "week": week},
        )
        .mappings()
        .all()
    )
    start, end = week_window(week)
    flow = (
        conn.execute(
            text(
                """
            WITH movements AS (
                SELECT sender, receiver, amount, payment_type, sender_country, receiver_country
                FROM transactions
                WHERE sender = :account AND occurred_at >= :start AND occurred_at < :end
                UNION ALL
                SELECT sender, receiver, amount, payment_type, sender_country, receiver_country
                FROM transactions
                WHERE receiver = :account AND sender <> :account
                  AND occurred_at >= :start AND occurred_at < :end
            )
            SELECT count(*) AS transaction_count,
                count(DISTINCT sender) FILTER (
                    WHERE receiver = :account AND sender <> :account) AS incoming_counterparties,
                count(DISTINCT receiver) FILTER (
                    WHERE sender = :account AND receiver <> :account) AS outgoing_counterparties,
                coalesce(sum(amount) FILTER (WHERE receiver = :account), 0) AS incoming_gbp,
                coalesce(sum(amount) FILTER (WHERE sender = :account), 0) AS outgoing_gbp,
                count(*) FILTER (WHERE sender_country <> receiver_country) AS cross_border_count,
                count(*) FILTER (WHERE payment_type IN (
                    'Cash Deposit', 'Cash Withdrawal')) AS cash_count,
                count(*) FILTER (WHERE amount > 0 AND mod(amount, 1000) = 0) AS round_amount_count,
                array_agg(DISTINCT sender) AS senders,
                array_agg(DISTINCT receiver) AS receivers
            FROM movements
            """
            ),
            {"account": account, "start": start, "end": end},
        )
        .mappings()
        .one()
    )
    return {
        "active_model_version": model["version"] if model else None,
        "model_version": model["model_version"] if model else None,
        "queue_cut": (
            round(float(model["threshold"]) * 100, 1)
            if model and model["threshold"] is not None
            else None
        ),
        "queue_alert_count": queue_count,
        "raw_contributions": raw_contributions,
        "flow": dict(flow),
        "account_history": [dict(row) for row in history],
        "prior_decisions": [dict(row) for row in decisions],
        "segment": segment,
    }
