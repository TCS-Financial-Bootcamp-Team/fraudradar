"""Testes da API contra um Postgres de verdade, com o esquema de db/init/.

Sem Postgres acessível os testes que usam `db` são pulados; no CI
(REQUIRE_TEST_DB=1) falham. Local: `docker compose up -d db`.
"""

import json
import os
from collections.abc import Iterator
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from fraudradar.config import ROOT_DIR, get_settings
from fraudradar.db import get_engine

DEFAULT_TEST_DB_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_test"


@pytest.fixture(scope="session")
def test_db_url() -> str:
    """Recria o banco de teste uma vez por sessão e aplica db/init/*.sql."""
    url = make_url(os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DB_URL))
    # O fixture apaga o banco: nunca aponte para o banco de desenvolvimento.
    if not (url.database or "").endswith("_test"):
        pytest.fail(f"TEST_DATABASE_URL precisa de um banco terminado em _test: {url.database}")
    admin = create_engine(
        url.set(database="postgres"),
        isolation_level="AUTOCOMMIT",
        connect_args={"connect_timeout": 3},
    )
    try:
        with admin.connect() as conn:
            conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)')
            conn.exec_driver_sql(f'CREATE DATABASE "{url.database}"')
    except OperationalError as exc:
        if os.environ.get("REQUIRE_TEST_DB") == "1":
            raise
        reason = f"Postgres de teste indisponível ({type(exc).__name__})"
        pytest.skip(f"{reason}: docker compose up -d db")
    finally:
        admin.dispose()
    engine = create_engine(url)
    with engine.begin() as conn:
        for sql_file in sorted((ROOT_DIR / "db" / "init").glob("*.sql")):
            conn.exec_driver_sql(sql_file.read_text(encoding="utf-8"))
    engine.dispose()
    return url.render_as_string(hide_password=False)


@pytest.fixture
def db(test_db_url, monkeypatch) -> Iterator[Engine]:
    """Banco vazio a cada teste; get_engine() (e portanto a API) aponta para ele."""
    monkeypatch.setenv("DATABASE_URL", test_db_url)
    get_settings.cache_clear()
    get_engine.cache_clear()
    engine = get_engine()
    with engine.begin() as conn:
        tables = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ).scalars()
        conn.exec_driver_sql(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")
    yield engine
    engine.dispose()


@pytest.fixture
def client(db, monkeypatch) -> Iterator[TestClient]:
    """Cliente da API com autenticação desligada: o usuário é LOCAL_USER."""
    monkeypatch.setenv("AUTH_DISABLED", "true")
    get_settings.cache_clear()
    from api.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def seed(db) -> "Seed":
    return Seed(db)


class Seed:
    """Insere linhas mínimas e coerentes com o esquema. Cada método devolve o id criado.

    Os formatos JSON (evidências, fontes, métricas) são o contrato com o worker:
    veja os comentários de db/init/002_tables.sql.
    """

    VERSION = "test-v1"

    def __init__(self, engine: Engine):
        self.engine = engine

    def _exec(self, sql: str, **params):
        with self.engine.begin() as conn:
            result = conn.execute(text(sql), params)
            return result.scalar() if result.returns_rows else None

    def model(self, version: str = VERSION, *, active: bool = True) -> str:
        self._exec(
            "INSERT INTO model_versions (version, features, threshold, active)"
            " VALUES (:v, '[]'::jsonb, 0.5, :a) ON CONFLICT (version) DO NOTHING",
            v=version,
            a=active,
        )
        return version

    def account(self, account: int) -> int:
        self._exec(
            "INSERT INTO accounts (account, first_seen_at, last_seen_at)"
            " VALUES (:c, '2022-10-07', '2023-08-23') ON CONFLICT (account) DO NOTHING",
            c=account,
        )
        return account

    def transaction(
        self,
        sender: int,
        receiver: int,
        occurred_at: datetime,
        amount: float = 100.0,
        *,
        currency: str = "UK pounds",
        received_currency: str | None = None,
        sender_country: str = "UK",
        receiver_country: str = "UK",
        payment_type: str = "Cross-border",
        label: int | None = None,
        typology: str = "Normal_Small_Fan_Out",
    ) -> int:
        """Transação; com `label` grava também o gabarito em `ground_truth`."""
        tid = self._exec(
            "INSERT INTO transactions (occurred_at, sender, receiver, amount, payment_currency,"
            " received_currency, sender_country, receiver_country, payment_type)"
            " VALUES (:dt, :s, :r, :a, :pc, :rc, :sc, :rco, :pt) RETURNING id",
            dt=occurred_at,
            s=sender,
            r=receiver,
            a=amount,
            pc=currency,
            rc=received_currency or currency,
            sc=sender_country,
            rco=receiver_country,
            pt=payment_type,
        )
        if label is not None:
            self._exec(
                "INSERT INTO ground_truth (transaction_id, label, original_typology, typology)"
                " VALUES (:id, :l, :t, :t)",
                id=tid,
                l=label,
                t=typology,
            )
        return tid

    def alert(
        self,
        account: int,
        week: date,
        *,
        score: float = 0.9,
        position: int = 1,
        status: str = "new",
        countries: tuple[str, ...] = ("UK",),
        typology: str | None = "Fan-out",
        total_amount: float = 1000.0,
        transaction_count: int = 3,
        version: str = VERSION,
    ) -> int:
        self.model(version)
        self.account(account)
        return self._exec(
            "INSERT INTO alerts (account, week, score, queue_position, status, countries, typology,"
            " total_amount, transaction_count, model_version)"
            " VALUES (:c, :w, :sc, :p, :st, :co, :t, :a, :tc, :m) RETURNING id",
            c=account,
            w=week,
            sc=score,
            p=position,
            st=status,
            co=list(countries),
            t=typology,
            a=total_amount,
            tc=transaction_count,
            m=version,
        )

    def evidence(
        self,
        alert_id: int,
        *,
        contributions: dict[str, float] | None = None,
        rules: list[dict] | None = None,
        signals: dict | None = None,
    ) -> int:
        self._exec(
            "INSERT INTO evidence (alert_id, contributions, rules, weekly_signals)"
            " VALUES (:a, CAST(:c AS jsonb), CAST(:r AS jsonb), CAST(:s AS jsonb))",
            a=alert_id,
            c=json.dumps(contributions or {}),
            r=json.dumps(rules or []),
            s=json.dumps(signals or {}),
        )
        return alert_id

    def assessment(
        self,
        alert_id: int,
        content: str = "Parecer de teste [1].",
        *,
        sources: list[dict] | None = None,
        created_at: datetime | None = None,
    ) -> int:
        return self._exec(
            "INSERT INTO assessments (alert_id, content, sources, created_at)"
            " VALUES (:a, :t, CAST(:f AS jsonb), COALESCE(:c, now())) RETURNING id",
            a=alert_id,
            t=content,
            f=json.dumps(
                sources if sources is not None else [{"title": "[1] Lei", "excerpt": "x"}]
            ),
            c=created_at,
        )

    def decision(
        self,
        alert_id: int,
        decision: str = "report",
        *,
        analyst: str = "Ana Analista",
        justification: str = "Justificativa de teste suficiente.",
        assessment_id: int | None = None,
    ) -> int:
        return self._exec(
            "INSERT INTO decisions (alert_id, assessment_id, analyst, decision, justification)"
            " VALUES (:a, :p, :an, :d, :j) RETURNING id",
            a=alert_id,
            p=assessment_id,
            an=analyst,
            d=decision,
            j=justification,
        )

    def report(
        self,
        alert_id: int,
        decision_id: int,
        draft: str = "Rascunho de comunicação ao COAF para teste.",
        *,
        approved_by: str | None = None,
    ) -> int:
        """Rascunho; com `approved_by` já nasce aprovado."""
        return self._exec(
            "INSERT INTO reports (alert_id, decision_id, draft, status, approved_by,"
            " approved_at) VALUES (:a, :d, :r, :s, :ap,"
            " CASE WHEN CAST(:ap AS text) IS NULL THEN NULL ELSE now() END) RETURNING id",
            a=alert_id,
            d=decision_id,
            r=draft,
            s="approved" if approved_by else "draft",
            ap=approved_by,
        )

    def batch(
        self,
        week: date,
        *,
        active_accounts: int = 1000,
        metrics: dict | None = None,
        released: bool = False,
        version: str = VERSION,
    ) -> date:
        """Semana processada pelo worker; `released` simula o replay já tê-la mostrado."""
        self.model(version)
        self._exec(
            "INSERT INTO weekly_batches"
            " (week, model_version, active_accounts, metrics, released_at)"
            " VALUES (:w, :m, :c, CAST(:me AS jsonb), CASE WHEN :l THEN now() END)",
            w=week,
            m=version,
            c=active_accounts,
            me=json.dumps(metrics or {}),
            l=released,
        )
        return week

    def count(self, table: str, where: str = "true", **params) -> int:
        """SELECT count(*) para conferir efeitos colaterais nos testes."""
        return self._exec(f"SELECT count(*) FROM {table} WHERE {where}", **params)

    def row(self, sql: str, **params) -> dict | None:
        with self.engine.connect() as conn:
            r = conn.execute(text(sql), params).mappings().first()
            return dict(r) if r else None
