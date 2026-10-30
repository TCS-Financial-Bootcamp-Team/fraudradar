"""SQL da fila de alertas, do detalhe e do grafo de 2 saltos."""

from datetime import date, datetime, time, timedelta
from typing import Any, Literal

from sqlalchemy import Connection, RowMapping, text

from api.domain import ALERT_COLUMNS, STATUS_FROM_FRONT
from api.schemas.alerts import (
    AlertStatus,
    Assessment,
    Contribution,
    Edge,
    Movement,
    Node,
    Rule,
    Source,
)
from fraudradar.data.schema import AMOUNT_CURRENCY
from fraudradar.features import feature_label

SortOrder = Literal["score_desc", "queue"]

_SORT_SQL: dict[SortOrder, str] = {
    "score_desc": "a.score DESC, a.queue_position, a.id",
    "queue": "a.queue_position, a.id",
}

TOP_CONTRIBUTIONS = 6
MOVEMENT_LIMIT = 200
EDGE_LIMIT = 30


def week_window(week: date) -> tuple[datetime, datetime]:
    """[segunda 00:00, segunda seguinte 00:00)."""
    start = datetime.combine(week, time.min)
    return start, start + timedelta(days=7)


def list_queue(
    conn: Connection,
    week: date,
    *,
    status: AlertStatus | None,
    country: str | None,
    page: int,
    size: int,
    sort: SortOrder,
) -> tuple[list[RowMapping], int]:
    """Página da fila e total com os mesmos filtros."""
    filters = ["a.week = :week"]
    params: dict[str, Any] = {"week": week}
    if status is not None:
        filters.append("a.status = ANY(CAST(:status AS text[]))")
        params["status"] = list(STATUS_FROM_FRONT[status])
    if country is not None:
        filters.append("a.countries @> CAST(:country AS text[])")
        params["country"] = [country]
    where_clause = " AND ".join(filters)
    total = conn.execute(
        text(f"SELECT count(*) FROM alerts a WHERE {where_clause}"), params
    ).scalar_one()
    rows = (
        conn.execute(
            text(
                f"SELECT {ALERT_COLUMNS} FROM alerts a WHERE {where_clause}"
                f" ORDER BY {_SORT_SQL[sort]} LIMIT :limit OFFSET :offset"
            ),
            {**params, "limit": size, "offset": (page - 1) * size},
        )
        .mappings()
        .all()
    )
    return list(rows), total


def week_countries(conn: Connection, week: date) -> list[str]:
    """Todos os países da semana, para o dropdown do front."""
    return list(
        conn.execute(
            text(
                "SELECT DISTINCT unnest(countries) AS country FROM alerts"
                " WHERE week = :week ORDER BY country"
            ),
            {"week": week},
        ).scalars()
    )


def alert_contributions(conn: Connection, alert_id: int) -> list[Contribution]:
    """Top 6 contribuições SHAP positivas, em % do total das positivas."""
    raw = conn.execute(
        text("SELECT contributions FROM evidence WHERE alert_id = :id"), {"id": alert_id}
    ).scalar()
    if not isinstance(raw, dict):
        return []
    positive = {
        name: float(v)
        for name, v in raw.items()
        if isinstance(v, int | float) and not isinstance(v, bool) and v > 0
    }
    total = sum(positive.values())
    if total <= 0:
        return []
    ordered = sorted(positive.items(), key=lambda pair: pair[1], reverse=True)
    return [
        Contribution(name=feature_label(name), value=round(v / total * 100, 1))
        for name, v in ordered[:TOP_CONTRIBUTIONS]
    ]


def alert_rules(conn: Connection, alert_id: int) -> list[Rule]:
    raw = conn.execute(
        text("SELECT rules FROM evidence WHERE alert_id = :id"), {"id": alert_id}
    ).scalar()
    if not isinstance(raw, list):
        return []
    return [
        Rule(code=r["code"], description=r["description"])
        for r in raw
        if isinstance(r, dict)
        and isinstance(r.get("code"), str)
        and isinstance(r.get("description"), str)
    ]


def account_movements(conn: Connection, account: int, week: date) -> list[Movement]:
    """Transações da conta na semana (enviadas e recebidas) em ordem cronológica.

    Acima de 200, ficam as 200 de maior valor: cortar por data esconderia o fim da semana.
    O total real está em `transaction_count` do alerta.
    """
    start, end = week_window(week)
    # Dois ramos para usar os índices (sender, occurred_at) e (receiver, occurred_at);
    # o segundo exclui sender = account para a autotransferência aparecer uma vez.
    rows = conn.execute(
        text(
            """
            SELECT * FROM (
                SELECT id, occurred_at, sender, receiver, amount, payment_currency, payment_type
                FROM (
                    SELECT id, occurred_at, sender, receiver, amount, payment_currency,
                           payment_type
                    FROM transactions
                    WHERE sender = :account AND occurred_at >= :start AND occurred_at < :end
                    UNION ALL
                    SELECT id, occurred_at, sender, receiver, amount, payment_currency,
                           payment_type
                    FROM transactions
                    WHERE receiver = :account AND sender <> :account
                      AND occurred_at >= :start AND occurred_at < :end
                ) t
                ORDER BY amount DESC, occurred_at, id
                LIMIT :limit
            ) top_rows
            ORDER BY occurred_at, id
            """
        ),
        {"account": account, "start": start, "end": end, "limit": MOVEMENT_LIMIT},
    ).mappings()
    return [
        Movement(
            id=str(t["id"]),
            date=t["occurred_at"].isoformat(),
            sender=str(t["sender"]),
            receiver=str(t["receiver"]),
            amount=float(t["amount"]),
            currency=AMOUNT_CURRENCY,
            payment_type=t["payment_type"],
            payment_currency=t["payment_currency"],
        )
        for t in rows
    ]


def latest_assessment(conn: Connection, alert_id: int) -> Assessment | None:
    row = (
        conn.execute(
            text(
                "SELECT content, sources FROM assessments WHERE alert_id = :id"
                " ORDER BY created_at DESC, id DESC LIMIT 1"
            ),
            {"id": alert_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        return None
    sources = row["sources"] if isinstance(row["sources"], list) else []
    return Assessment(
        content=row["content"],
        sources=[
            Source(title=s["title"], excerpt=s["excerpt"])
            for s in sources
            if isinstance(s, dict)
            and isinstance(s.get("title"), str)
            and isinstance(s.get("excerpt"), str)
        ],
    )


def _query_edges(
    conn: Connection, sql: str, params: dict[str, Any]
) -> list[tuple[int, int, float]]:
    rows = conn.execute(text(sql), {**params, "limit": EDGE_LIMIT}).all()
    return [(int(s), int(t), float(v)) for s, t, v in rows]


def two_hop_graph(conn: Connection, account: int, week: date) -> tuple[list[Node], list[Edge]]:
    """Arestas (sender, receiver) agregadas: salto 1 (30 maiores) e salto 2 (30 maiores)."""
    start, end = week_window(week)
    window = {"start": start, "end": end}
    hop1 = _query_edges(
        conn,
        """
        SELECT sender, receiver, SUM(amount) AS amount FROM (
            SELECT sender, receiver, amount FROM transactions
            WHERE sender = :account AND occurred_at >= :start AND occurred_at < :end
            UNION ALL
            SELECT sender, receiver, amount FROM transactions
            WHERE receiver = :account AND sender <> :account
              AND occurred_at >= :start AND occurred_at < :end
        ) t
        GROUP BY sender, receiver
        ORDER BY amount DESC, sender, receiver
        LIMIT :limit
        """,
        {"account": account, **window},
    )
    neighbors = sorted({c for s, t, _ in hop1 for c in (s, t)} - {account})
    hop2: list[tuple[int, int, float]] = []
    if neighbors:
        # Arestas que saem ou chegam nas vizinhas, sem tocar a conta; o segundo ramo pula as que
        # o primeiro já pegou (sender também vizinha).
        hop2 = _query_edges(
            conn,
            """
            SELECT sender, receiver, SUM(amount) AS amount FROM (
                SELECT sender, receiver, amount FROM transactions
                WHERE sender = ANY(CAST(:neighbors AS bigint[])) AND receiver <> :account
                  AND occurred_at >= :start AND occurred_at < :end
                UNION ALL
                SELECT sender, receiver, amount FROM transactions
                WHERE receiver = ANY(CAST(:neighbors AS bigint[])) AND sender <> :account
                  AND NOT (sender = ANY(CAST(:neighbors AS bigint[])))
                  AND occurred_at >= :start AND occurred_at < :end
            ) t
            GROUP BY sender, receiver
            ORDER BY amount DESC, sender, receiver
            LIMIT :limit
            """,
            {"account": account, "neighbors": neighbors, **window},
        )
    edges = [Edge(id=f"{s}-{t}", source=str(s), target=str(t), amount=v) for s, t, v in hop1 + hop2]
    endpoints = {int(e.source) for e in edges} | {int(e.target) for e in edges}
    nodes = [Node(id=str(account), label=str(account), central=True)] + [
        Node(id=str(c), label=str(c), central=False) for c in sorted(endpoints - {account})
    ]
    return nodes, edges
