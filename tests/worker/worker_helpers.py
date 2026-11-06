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
