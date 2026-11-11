"""Fonte externa falsa para os testes: um schema com uma tabela no formato do SAML-D, dentro do
próprio banco de teste (nome terminado em ``_test``). Nada aqui toca o banco real.
"""

import os
import re
from datetime import datetime, timedelta
from typing import Any

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import Engine, text
from sqlalchemy.engine import make_url

from fraudradar import datasets
from fraudradar.config import get_settings

SOURCE_SCHEMA = "fake_source"
DEFAULT_TEST_DB_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_test"

_DDL = """
CREATE SCHEMA IF NOT EXISTS fake_source;
DROP TABLE IF EXISTS fake_source.{table};
CREATE TABLE fake_source.{table} (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    {columns}
);
"""


def connection_settings(test_db_url: str) -> dict[str, Any]:
    """Host, porta, banco e usuário do próprio banco de teste, para cadastrar como fonte."""
    url = make_url(os.environ.get("TEST_DATABASE_URL", test_db_url))
    return {
        "host": url.host or "127.0.0.1",
        "port": url.port or 5432,
        "database": url.database,
        "user": url.username,
        "password": url.password,
    }


def make_rows(
    count: int,
    *,
    start: datetime = datetime(2023, 9, 4, 10, 0),
    accounts: tuple[int, ...] = (9001, 9002, 9003, 9004),
    step: timedelta = timedelta(hours=1),
    labeled_every: int = 5,
) -> list[dict[str, Any]]:
    rows = []
    for i in range(count):
        moment = start + step * i
        rows.append(
            {
                "Time": moment.time(),
                "Date": moment.date(),
                "Sender_account": accounts[i % len(accounts)],
                "Receiver_account": accounts[(i + 1) % len(accounts)],
                "Amount": 100 + i,
                "Payment_currency": "UK pounds",
                "Received_currency": "UK pounds",
                "Sender_bank_location": "UK",
                "Receiver_bank_location": "UK",
                "Payment_type": "Cross-border",
                "Is_laundering": 1 if i % labeled_every == 0 else 0,
                "Laundering_type": "Fan-out" if i % labeled_every == 0 else "Normal_Small_Fan_Out",
            }
        )
    return rows


_TYPES = {
    "Time": "time",
    "Date": "date",
    "Sender_account": "bigint",
    "Receiver_account": "bigint",
    "Amount": "numeric(14,2)",
    "Payment_currency": "text",
    "Received_currency": "text",
    "Sender_bank_location": "text",
    "Receiver_bank_location": "text",
    "Payment_type": "text",
    "Is_laundering": "smallint",
    "Laundering_type": "text",
}


def create_source(
    engine: Engine,
    rows: list[dict[str, Any]],
    *,
    table: str = "saml",
    drop: tuple[str, ...] = (),
    types: dict[str, str] | None = None,
    lowercase: bool = False,
) -> str:
    """Cria ``fake_source.<table>`` com ``rows``; devolve ``fake_source.<table>``."""
    chosen = {c: t for c, t in {**_TYPES, **(types or {})}.items() if c not in drop}
    name = (lambda c: c.lower()) if lowercase else (lambda c: c)
    columns = ", ".join(f'"{name(c)}" {t}' for c, t in chosen.items())
    with engine.begin() as conn:
        conn.exec_driver_sql(_DDL.format(table=table, columns=columns))
        if rows:
            fields = ", ".join(f'"{name(c)}"' for c in chosen)
            marks = ", ".join(f":{c}" for c in chosen)
            conn.execute(
                text(f"INSERT INTO fake_source.{table} ({fields}) VALUES ({marks})"),
                [{c: row[c] for c in chosen} for row in rows],
            )
    return f"{SOURCE_SCHEMA}.{table}"


def append_rows(engine: Engine, rows: list[dict[str, Any]], *, table: str = "saml") -> None:
    with engine.begin() as conn:
        fields = ", ".join(f'"{c}"' for c in _TYPES)
        marks = ", ".join(f":{c}" for c in _TYPES)
        conn.execute(text(f"INSERT INTO fake_source.{table} ({fields}) VALUES ({marks})"), rows)


def configure(monkeypatch, hosts: str = "127.0.0.1,localhost") -> str:
    """Chave de cifra de teste e hosts liberados; devolve a chave."""
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("CONNECTIONS_SECRET_KEY", key)
    monkeypatch.setenv("EXTERNAL_DB_ALLOWED_HOSTS", hosts)
    get_settings.cache_clear()
    return key


@pytest.fixture
def allow_connection_source(db, monkeypatch) -> None:
    """Aceita ``source = 'connection'`` em ``ingestions`` (public e conjuntos novos).

    O CHECK vive em db/init/002_tables.sql, que não é desta frente; este fixture cobre o
    intervalo até a lista de origens ser unificada. Idempotente se o DDL já aceitar.
    """
    with db.begin() as conn:
        conn.exec_driver_sql(
            "ALTER TABLE public.ingestions DROP CONSTRAINT IF EXISTS ingestions_source_check"
        )
        conn.exec_driver_sql(
            "ALTER TABLE public.ingestions ADD CONSTRAINT ingestions_source_check "
            "CHECK (source IN ('csv', 'manual', 'simulation', 'connection'))"
        )
    original = datasets._data_ddl()
    patched = re.sub(
        r"CHECK \(source IN \([^)]*\)\)",
        "CHECK (source IN ('csv', 'manual', 'simulation', 'connection'))",
        original,
        count=1,
    )
    monkeypatch.setattr(datasets, "_data_ddl", lambda: patched)


@pytest.fixture
def source_env(db, test_db_url, monkeypatch) -> dict[str, Any]:
    """Chave e hosts de teste configurados; devolve host/porta/banco/usuário/senha da fonte."""
    configure(monkeypatch)
    return connection_settings(test_db_url)
