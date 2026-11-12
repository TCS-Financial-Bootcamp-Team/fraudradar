"""Constantes e funções dos testes do worker (o dado sintético, o SQL de conferência)."""

from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
from sqlalchemy import Engine, text

FIRST_WEEK = date(2023, 5, 22)  # a primeira segunda depois do treino (TRAIN_END = 2023-05-21)
LAST_WEEK = date(2023, 7, 24)  # a última semana do dado sintético
TEST_WEEKS = [FIRST_WEEK + timedelta(weeks=i) for i in range(10)]
IN_SAMPLE_WEEK = date(2023, 5, 15)


def write_saml_d_csv(transactions: pd.DataFrame, ground_truth: pd.DataFrame, path: Path) -> Path:
    """O dado sintético (colunas do banco) de volta no formato do SAML-D.csv."""
    when = transactions["occurred_at"]
    pd.DataFrame(
        {
            "Time": when.dt.strftime("%H:%M:%S"),
            "Date": when.dt.strftime("%Y-%m-%d"),
            "Sender_account": transactions["sender"],
            "Receiver_account": transactions["receiver"],
            "Amount": transactions["amount"],
            "Payment_currency": transactions["payment_currency"],
            "Received_currency": transactions["received_currency"],
            "Sender_bank_location": transactions["sender_country"],
            "Receiver_bank_location": transactions["receiver_country"],
            "Payment_type": transactions["payment_type"],
            "Is_laundering": ground_truth["label"],
            "Laundering_type": ground_truth["original_typology"],
        }
    ).to_csv(path, index=False)
    return path


def rows(engine: Engine, sql: str, **params) -> list[dict]:
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text(sql), params).mappings()]


def scalar(engine: Engine, sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar()


def execute(engine: Engine, sql: str, **params) -> None:
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def week_bounds(week: date) -> dict:
    start = datetime.combine(week, datetime.min.time())
    return {"start": start, "end": start + timedelta(days=7)}


# Rotula as contas-semana dos alertas ainda sem decisão a partir do gabarito, como faria um
# analista que acerta sempre: comunica a conta que lavou na semana (pelo lado dela, com o CAIXA
# no outro lado da espécie, como no modelo) e arquiva as outras como falso positivo confirmado.
LABEL_FROM_TRUTH = """
WITH truth AS (
    SELECT a.id AS alert_id, COALESCE(bool_or(g.label = 1), false) AS launders
    FROM alerts a
    JOIN transactions t
      ON t.occurred_at >= a.week AND t.occurred_at < a.week + 7
     AND ((t.sender = a.account AND t.payment_type <> 'Cash Deposit')
       OR (t.receiver = a.account AND t.payment_type <> 'Cash Withdrawal'))
    JOIN ground_truth g ON g.transaction_id = t.id
    WHERE a.week >= :start AND a.week <= :end
      AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.alert_id = a.id)
    GROUP BY a.id
), decided AS (
    INSERT INTO decisions (alert_id, analyst, decision, justification, archive_reason)
    SELECT alert_id, 'Teste', CASE WHEN launders THEN 'report' ELSE 'archive' END,
           'Rótulo de teste tirado do gabarito.',
           CASE WHEN launders THEN NULL ELSE 'false_positive' END
    FROM truth
    RETURNING id, alert_id, decision
)
INSERT INTO analyst_labels (alert_id, decision_id, account, week, label, origin, source)
SELECT a.id, d.id, a.account, a.week, CASE WHEN d.decision = 'report' THEN 1 ELSE 0 END,
       a.origin, :source
FROM decided d JOIN alerts a ON a.id = d.alert_id
"""


def label_from_truth(engine: Engine, start: date, end: date, source: str = "analyst") -> int:
    """Rótulos tirados do gabarito para os alertas das semanas de `start` a `end`; devolve
    quantos rótulos existem depois."""
    execute(engine, LABEL_FROM_TRUTH, start=start, end=end, source=source)
    return scalar(engine, "SELECT count(*) FROM analyst_labels")
