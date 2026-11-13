"""SQL do worker: leitura das transações e gravação do lote de uma semana.

SQLAlchemy Core com `text()` e parâmetros nomeados, como na API (`api/AGENTS.md`). Carga em
massa por COPY pela conexão psycopg da própria transação (`conn.connection.driver_connection`).
f-string em SQL só com nomes fixos deste código, nunca com valor vindo de fora.

Este arquivo não lê `ground_truth`: só `worker/metrics.py` lê, para as métricas da semana.
"""

import json
import math
import tempfile
from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd
from psycopg import sql
from sqlalchemy import Connection, text

ACTOR = "worker"
# Contas por semana na amostra de controle quando o conjunto ainda não tem linha em
# public.processing_settings (o mesmo padrão da coluna exploration_per_week).
DEFAULT_EXPLORATION_PER_WEEK = 5

# Colunas lidas de `transactions`: as 10 do SAML-D com o `id`, e o envio de origem.
TRANSACTION_COLUMNS = [
    "id",
    "occurred_at",
    "sender",
    "receiver",
    "amount",
    "payment_currency",
    "received_currency",
    "sender_country",
    "receiver_country",
    "payment_type",
    "ingestion_id",
]
_TEXT_COLUMNS = [
    "payment_currency",
    "received_currency",
    "sender_country",
    "receiver_country",
    "payment_type",
]
# Os mesmos tipos da carga do treino (fraudradar.data.saml_d.load_csv): as variáveis saem iguais.
_READ_DTYPES = {
    "id": "int64",
    "sender": "int64",
    "receiver": "int64",
    "amount": "float64",
    "ingestion_id": "Int64",
    **dict.fromkeys(_TEXT_COLUMNS, "category"),
}


def week_window(week: date) -> tuple[datetime, datetime]:
    """[segunda 00:00, segunda seguinte 00:00), como em `api/repositories/alert_queue.py`."""
    start = datetime.combine(week, time.min)
    return start, start + timedelta(days=7)


def to_json(value) -> str:
    """JSON para uma coluna JSONB: tipos do numpy viram nativos e NaN/infinito viram null (o
    Postgres recusa NaN em JSONB)."""
    return json.dumps(_plain(value), ensure_ascii=False, allow_nan=False)


def _plain(value):
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_plain(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _cursor(conn: Connection):
    return conn.connection.driver_connection.cursor()


def copy_frame(conn: Connection, table: str, frame: pd.DataFrame, chunk_rows: int = 500_000):
    """COPY de um DataFrame cujas colunas são colunas da tabela, em pedaços de CSV.

    Nulo (NaN, NaT, NA) vira NULL; datas saem como AAAA-MM-DD HH:MM:SS.
    """
    columns = ", ".join(frame.columns)
    statement = f"COPY {table} ({columns}) FROM STDIN WITH (FORMAT csv)"
    with _cursor(conn) as cursor, cursor.copy(statement) as copy:
        for begin in range(0, len(frame), chunk_rows):
            chunk = frame.iloc[begin : begin + chunk_rows]
            copy.write(chunk.to_csv(index=False, header=False, lineterminator="\n"))


# --- leitura -------------------------------------------------------------------------------


def read_transactions(conn: Connection, start: datetime, end: datetime) -> pd.DataFrame:
    """As transações com `occurred_at` em [start, end), por COPY, com os tipos do treino.

    Passa por um arquivo temporário para não guardar o texto inteiro na memória (o SAML-D
    tem ~1 GB em CSV).
    """
    conn.execute(text("SET LOCAL DateStyle = 'ISO'"))
    query = sql.SQL(
        "COPY (SELECT {columns} FROM transactions"
        " WHERE occurred_at >= {start} AND occurred_at < {end}) TO STDOUT WITH (FORMAT csv)"
    ).format(
        columns=sql.SQL(", ").join(map(sql.Identifier, TRANSACTION_COLUMNS)),
        start=sql.Literal(start),
        end=sql.Literal(end),
    )
    with tempfile.TemporaryFile() as buffer:
        with _cursor(conn) as cursor, cursor.copy(query) as copy:
            for chunk in copy:
                buffer.write(chunk)
        empty = buffer.tell() == 0
        buffer.seek(0)
        if empty:
            frame = pd.DataFrame(
                {c: pd.Series(dtype=_READ_DTYPES.get(c, "object")) for c in TRANSACTION_COLUMNS}
            )
        else:
            frame = pd.read_csv(
                buffer,
                names=TRANSACTION_COLUMNS,
                dtype=_READ_DTYPES,
                keep_default_na=False,  # "NA" pode ser texto; só ingestion_id tem nulo
                na_values={"ingestion_id": [""]},
            )
    frame["occurred_at"] = pd.to_datetime(frame["occurred_at"], format="ISO8601")
    return frame


def weeks_with_transactions(conn: Connection, start: datetime, end: datetime) -> set[date]:
    """As semanas (segundas) com alguma transação em [start, end)."""
    rows = conn.execute(
        text(
            "SELECT DISTINCT CAST(date_trunc('week', occurred_at) AS date) FROM transactions"
            " WHERE occurred_at >= :start AND occurred_at < :end"
        ),
        {"start": start, "end": end},
    ).scalars()
    return set(rows)


def last_transaction_at(conn: Connection) -> datetime | None:
    return conn.execute(text("SELECT max(occurred_at) FROM transactions")).scalar()


def first_transaction_at(conn: Connection, since: datetime | None = None) -> datetime | None:
    """A primeira transação a partir de `since` (sem `since`, a primeira do conjunto)."""
    if since is None:
        return conn.execute(text("SELECT min(occurred_at) FROM transactions")).scalar()
    return conn.execute(
        text("SELECT min(occurred_at) FROM transactions WHERE occurred_at >= :since"),
        {"since": since},
    ).scalar()


def processed_weeks(conn: Connection, weeks: list[date]) -> set[date]:
    rows = conn.execute(
        text("SELECT week FROM weekly_batches WHERE week = ANY(CAST(:weeks AS date[]))"),
        {"weeks": list(weeks)},
    ).scalars()
    return set(rows)


def latest_processed_week(conn: Connection) -> date | None:
    return conn.execute(text("SELECT max(week) FROM weekly_batches")).scalar()


def transaction_count(conn: Connection, week: date) -> int:
    """Quantidade atual de transações do período, usada para evitar recomputação vazia."""
    start, end = week_window(week)
    return conn.execute(
        text(
            "SELECT count(*) FROM transactions WHERE occurred_at >= :start AND occurred_at < :end"
        ),
        {"start": start, "end": end},
    ).scalar_one()


def processed_transaction_count(conn: Connection, week: date) -> int | None:
    """Quantidade registrada no último lote; lotes antigos sem a chave voltam como None."""
    value = conn.execute(
        text("SELECT metrics ->> 'transaction_count' FROM weekly_batches WHERE week = :week"),
        {"week": week},
    ).scalar()
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def exploration_per_week(conn: Connection, dataset_slug: str) -> int:
    """Quantas contas fora da fila o conjunto sorteia por semana (0 = amostra desligada)."""
    value = conn.execute(
        text("SELECT exploration_per_week FROM public.processing_settings WHERE dataset = :slug"),
        {"slug": dataset_slug},
    ).scalar()
    return DEFAULT_EXPLORATION_PER_WEEK if value is None else int(value)


def saml_d_count(conn: Connection) -> int:
    """Transações da carga do SAML-D (sem envio de origem)."""
    return conn.execute(
        text("SELECT count(*) FROM transactions WHERE ingestion_id IS NULL")
    ).scalar_one()


def has_ingested(conn: Connection) -> bool:
    """Já há transações enviadas pela API (POST /ingestion/*)?"""
    return conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM transactions WHERE ingestion_id IS NOT NULL)")
    ).scalar_one()


# --- trava e proteção do trabalho dos analistas ---------------------------------------------


def lock_worker(conn: Connection) -> None:
    """Um worker grava por vez: duas execuções juntas nunca processam a mesma semana."""
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('fraudradar.worker'))"))


def protection(conn: Connection, week: date, *, lock: bool = False) -> str | None:
    """Por que a semana não pode ser apagada e refeita, ou None se pode.

    Trabalho de analista nunca é apagado: semana já liberada no replay, alerta com decisão ou
    alerta que já saiu de `new`. Com `lock`, trava o lote e os alertas da semana até o fim da
    transação (a API trava o alerta com FOR UPDATE ao decidir, e o lote ao liberar).
    """
    for_update = " FOR UPDATE" if lock else ""
    released = conn.execute(
        text(f"SELECT released_at FROM weekly_batches WHERE week = :week{for_update}"),
        {"week": week},
    ).scalar()
    if released is not None:
        return "já foi liberada no replay"
    if lock:
        conn.execute(text("SELECT id FROM alerts WHERE week = :week FOR UPDATE"), {"week": week})
    decided = conn.execute(
        text(
            "SELECT count(DISTINCT a.id) FROM alerts a JOIN decisions d ON d.alert_id = a.id"
            " WHERE a.week = :week"
        ),
        {"week": week},
    ).scalar_one()
    if decided:
        return f"{decided} alerta(s) já têm decisão de analista"
    touched = conn.execute(
        text("SELECT count(*) FROM alerts WHERE week = :week AND status <> 'new'"),
        {"week": week},
    ).scalar_one()
    if touched:
        return f"{touched} alerta(s) já saíram do status new"
    return None


# --- gravação do lote -------------------------------------------------------------------------


def upsert_model_version(conn: Connection, version: str, card: dict) -> None:
    """A versão da ficha vira a única ativa (há um índice único na ativa)."""
    conn.execute(
        text("UPDATE model_versions SET active = false WHERE active AND version <> :version"),
        {"version": version},
    )
    metrics = {**card["metrics"], "transaction_threshold": card["transaction_threshold"]}
    conn.execute(
        text(
            """
            INSERT INTO model_versions (version, features, threshold, metrics, active)
            VALUES (:version, CAST(:features AS jsonb), :threshold, CAST(:metrics AS jsonb), true)
            ON CONFLICT (version) DO UPDATE SET
                features = EXCLUDED.features,
                threshold = EXCLUDED.threshold,
                metrics = EXCLUDED.metrics,
                active = true
            """
        ),
        {
            "version": version,
            "features": to_json(card["features"]),
            "threshold": card["queue_cut"],
            "metrics": to_json(metrics),
        },
    )


def clear_week(conn: Connection, week: date, version: str, transaction_ids: np.ndarray) -> None:
    """Apaga o que o worker gravou da semana: alertas (evidências e pareceres vão em cascata),
    scores desta versão do modelo e o lote. Só chame depois de `protection` dizer None."""
    conn.execute(text("DELETE FROM alerts WHERE week = :week"), {"week": week})
    conn.execute(
        text(
            "DELETE FROM transaction_scores WHERE model_version = :version"
            " AND transaction_id = ANY(CAST(:ids AS bigint[]))"
        ),
        {"version": version, "ids": transaction_ids.tolist()},
    )
    conn.execute(text("DELETE FROM weekly_batches WHERE week = :week"), {"week": week})


def clear_open_week(
    conn: Connection, week: date, version: str, transaction_ids: np.ndarray
) -> set[int]:
    """Substitui só a parte ainda não decidida da fila do período aberto.

    Os alertas com decisão e todos os seus dependentes ficam congelados. As linhas são
    travadas antes da consulta para serializar esta operação com a decisão da API.
    """
    conn.execute(text("SELECT id FROM alerts WHERE week = :week FOR UPDATE"), {"week": week})
    decided_accounts = set(
        conn.execute(
            text(
                "SELECT DISTINCT a.account FROM alerts a"
                " WHERE a.week = :week"
                " AND EXISTS (SELECT 1 FROM decisions d WHERE d.alert_id = a.id)"
            ),
            {"week": week},
        ).scalars()
    )
    conn.execute(
        text(
            "DELETE FROM alerts a WHERE a.week = :week"
            " AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.alert_id = a.id)"
        ),
        {"week": week},
    )
    conn.execute(
        text(
            "DELETE FROM transaction_scores WHERE model_version = :version"
            " AND transaction_id = ANY(CAST(:ids AS bigint[]))"
        ),
        {"version": version, "ids": transaction_ids.tolist()},
    )
    conn.execute(text("DELETE FROM weekly_batches WHERE week = :week"), {"week": week})
    return {int(account) for account in decided_accounts}


def count_alerts(conn: Connection, week: date) -> tuple[int, int]:
    """(alertas da fila do modelo, contas da amostra de controle) gravados na semana."""
    row = conn.execute(
        text(
            "SELECT count(*) FILTER (WHERE origin = 'model') AS model,"
            " count(*) FILTER (WHERE origin = 'exploration') AS exploration"
            " FROM alerts WHERE week = :week"
        ),
        {"week": week},
    ).one()
    return int(row.model), int(row.exploration)


def copy_scores(conn: Connection, ids: np.ndarray, version: str, scores: np.ndarray) -> None:
    """Um score por transação. REAL no banco: grava o float32, que volta igual."""
    frame = pd.DataFrame(
        {"transaction_id": ids, "model_version": version, "score": scores.astype("float32")}
    )
    copy_frame(conn, "transaction_scores", frame)


def upsert_accounts(conn: Connection, frame: pd.DataFrame) -> None:
    """Contas vistas na semana: `account`, `first_seen_at`, `last_seen_at` e `segment` (nulo
    mantém o segmento atual). Conta nova (ex.: veio da ingestão) entra aqui."""
    conn.execute(
        text(
            "CREATE TEMP TABLE week_accounts (account bigint PRIMARY KEY,"
            " first_seen_at timestamp NOT NULL, last_seen_at timestamp NOT NULL,"
            " segment smallint) ON COMMIT DROP"
        )
    )
    copy_frame(
        conn, "week_accounts", frame[["account", "first_seen_at", "last_seen_at", "segment"]]
    )
    # O WHERE evita reescrever as contas que não mudaram (quase todas, depois da carga).
    conn.execute(
        text(
            """
            INSERT INTO accounts AS a (account, first_seen_at, last_seen_at, segment)
            SELECT account, first_seen_at, last_seen_at, segment FROM week_accounts
            ON CONFLICT (account) DO UPDATE SET
                first_seen_at = LEAST(a.first_seen_at, EXCLUDED.first_seen_at),
                last_seen_at = GREATEST(a.last_seen_at, EXCLUDED.last_seen_at),
                segment = COALESCE(EXCLUDED.segment, a.segment),
                updated_at = now()
            WHERE EXCLUDED.first_seen_at < a.first_seen_at
               OR EXCLUDED.last_seen_at > a.last_seen_at
               OR (EXCLUDED.segment IS NOT NULL AND EXCLUDED.segment IS DISTINCT FROM a.segment)
            """
        )
    )


def insert_alerts(conn: Connection, week: date, version: str, rows: list[dict]) -> None:
    """A fila da semana e, depois dela, a amostra de controle. `rows`: account, score,
    queue_position, countries, total_amount, transaction_count e origin (`model` ou
    `exploration`). Status `new` e tipologia nula (o modelo não prevê tipologia)."""
    if not rows:
        return
    conn.execute(
        text(
            """
            INSERT INTO alerts (account, week, score, queue_position, status, countries,
                                typology, total_amount, transaction_count, model_version, origin)
            SELECT r.account, :week, r.score, r.queue_position, 'new', r.countries,
                   NULL, r.total_amount, r.transaction_count, :version, r.origin
            FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(
                account bigint, score real, queue_position integer, countries text[],
                total_amount numeric, transaction_count integer, origin text)
            ORDER BY r.queue_position
            """
        ),
        {"week": week, "version": version, "rows": to_json(rows)},
    )


def insert_evidence(conn: Connection, week: date, rows: list[dict]) -> None:
    """Uma evidência por alerta da semana. `rows`: account, contributions, rules,
    weekly_signals. O grafo fica vazio: a API monta o de 2 saltos a partir de `transactions`."""
    if not rows:
        return
    conn.execute(
        text(
            """
            INSERT INTO evidence (alert_id, contributions, rules, weekly_signals, graph)
            SELECT a.id, r.contributions, r.rules, r.weekly_signals, CAST('{}' AS jsonb)
            FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(
                account bigint, contributions jsonb, rules jsonb, weekly_signals jsonb)
            JOIN alerts a ON a.account = r.account AND a.week = :week
            """
        ),
        {"week": week, "rows": to_json(rows)},
    )


def insert_weekly_batch(
    conn: Connection, week: date, version: str, active_accounts: int, metrics: dict
) -> None:
    conn.execute(
        text(
            "INSERT INTO weekly_batches (week, model_version, active_accounts, metrics)"
            " VALUES (:week, :version, :active_accounts, CAST(:metrics AS jsonb))"
        ),
        {
            "week": week,
            "version": version,
            "active_accounts": active_accounts,
            "metrics": to_json(metrics),
        },
    )


def update_ingestions(conn: Connection, ingestion_ids: list[int]) -> None:
    """Envios da API com transações na semana: `processing`; e `completed` quando todas as
    semanas que o envio toca já têm lote (o desta semana já foi gravado)."""
    if not ingestion_ids:
        return
    params = {"ids": [int(i) for i in ingestion_ids]}
    conn.execute(
        text(
            "UPDATE ingestions SET status = 'processing'"
            " WHERE id = ANY(CAST(:ids AS bigint[])) AND status = 'received'"
        ),
        params,
    )
    conn.execute(
        text(
            """
            UPDATE ingestions i SET status = 'completed'
            WHERE i.id = ANY(CAST(:ids AS bigint[])) AND i.status <> 'completed'
              AND NOT EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.ingestion_id = i.id
                    AND NOT EXISTS (
                        SELECT 1 FROM weekly_batches b
                        WHERE b.week = CAST(date_trunc('week', t.occurred_at) AS date)))
            """
        ),
        params,
    )


def audit_batch(conn: Connection, week: date, details: dict) -> None:
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
            " VALUES (:actor, 'batch', 'week', :week, CAST(:details AS jsonb))"
        ),
        {"actor": ACTOR, "week": week.isoformat(), "details": to_json(details)},
    )


# --- carga do SAML-D ---------------------------------------------------------------------------


def move_identity(conn: Connection) -> None:
    """Depois do COPY com ids explícitos, a identidade de `transactions` passa do maior id:
    sem isso, o POST /ingestion/* da API colidiria com as transações do SAML-D."""
    conn.execute(
        text(
            "SELECT setval(pg_get_serial_sequence('transactions', 'id'), max(id)) FROM transactions"
        )
    )
