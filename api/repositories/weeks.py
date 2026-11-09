"""Semanas processadas pelo worker (`weekly_batches`) e o replay que as libera uma a uma."""

import json
from datetime import date

from sqlalchemy import Connection, RowMapping, text

from api.dependencies import User
from api.domain import STATUS_FROM_FRONT


def released_weeks(conn: Connection) -> list[RowMapping]:
    sql = """
        SELECT b.week,
               count(a.id) AS alerts,
               count(a.id) FILTER (WHERE a.status = ANY(:pending)) AS pending
        FROM weekly_batches b
        LEFT JOIN alerts a ON a.week = b.week
        WHERE b.released_at IS NOT NULL
        GROUP BY b.week
        ORDER BY b.week DESC
    """
    pending = list(STATUS_FROM_FRONT["pending"])
    return list(conn.execute(text(sql), {"pending": pending}).mappings())


def next_release(conn: Connection) -> date | None:
    """A semana que o próximo replay libera: a processada mais antiga ainda não liberada."""
    return conn.execute(
        text("SELECT min(week) FROM weekly_batches WHERE released_at IS NULL")
    ).scalar()


def release_next_week(conn: Connection, user: User) -> tuple[date, int] | None:
    """Libera a semana processada mais antiga ainda não exibida. None se não houver."""
    # Dois cliques simultâneos liberam duas semanas em sequência, nunca a mesma duas vezes.
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('fraudradar.replay'))"))
    week = conn.execute(
        text("""
            UPDATE weekly_batches SET released_at = now()
            WHERE week = (SELECT min(week) FROM weekly_batches WHERE released_at IS NULL)
            RETURNING week
        """)
    ).scalar()
    if week is None:
        return None
    alerts = conn.execute(
        text("SELECT count(*) FROM alerts WHERE week = :week"), {"week": week}
    ).scalar_one()
    conn.execute(
        text("""
            INSERT INTO audit_log (actor, action, entity, entity_id, details)
            VALUES (:actor, 'replay', 'week', :week, CAST(:details AS jsonb))
        """),
        {
            "actor": user.name,
            "week": week.isoformat(),
            "details": json.dumps({"alerts": alerts, "user_id": user.id}),
        },
    )
    return week, alerts
