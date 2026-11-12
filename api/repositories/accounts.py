"""Consultas da lista consolidada de contas suspeitas."""

from datetime import date
from typing import Any

from sqlalchemy import Connection, text

from api.domain import (
    ALERT_COLUMNS,
    STATUS_FROM_FRONT,
    STATUS_TO_FRONT,
    UNDEFINED_COUNTRY,
    alert_from_row,
)
from api.schemas.accounts import AccountSort, SuspiciousAccount
from api.schemas.alerts import Alert, AlertStatus

_SORT_SQL: dict[AccountSort, str] = {
    "max_score_desc": "max_score DESC, latest_queue_position, account",
    "latest_score_desc": "latest_score DESC, latest_queue_position, account",
    "last_week_desc": "last_week DESC, max_score DESC, latest_queue_position, account",
}


def list_suspicious_accounts(
    conn: Connection,
    *,
    start: date | None,
    end: date | None,
    status: AlertStatus | None,
    search: str | None,
    page: int,
    size: int,
    sort: AccountSort,
) -> tuple[list[SuspiciousAccount], int]:
    filters = ["true"]
    params: dict[str, Any] = {"undefined_country": UNDEFINED_COUNTRY}
    if start is not None:
        filters.append("a.week >= :start")
        params["start"] = start
    if end is not None:
        filters.append("a.week <= :end")
        params["end"] = end
    if search and search.strip():
        filters.append("starts_with(CAST(a.account AS text), :search)")
        params["search"] = search.strip()
    aggregate_filter = ""
    if status is not None:
        aggregate_filter = "WHERE latest_status = ANY(CAST(:statuses AS text[]))"
        params["statuses"] = list(STATUS_FROM_FRONT[status])
    where = " AND ".join(filters)
    sql = f"""
        WITH filtered AS (
            SELECT a.*,
                   row_number() OVER (
                       PARTITION BY a.account ORDER BY a.week DESC, a.id DESC
                   ) AS latest_rank
            FROM alerts a
            WHERE {where}
        ), aggregated AS (
            SELECT account,
                   max(score) AS max_score,
                   max(score) FILTER (WHERE latest_rank = 1) AS latest_score,
                   count(DISTINCT week) AS alert_weeks,
                   min(week) AS first_week,
                   max(week) AS last_week,
                   sum(total_amount) AS total_flagged_amount,
                   (array_agg(COALESCE(countries[1], :undefined_country)
                              ORDER BY total_amount DESC, week DESC, id DESC))[1] AS country,
                   max(status) FILTER (WHERE latest_rank = 1) AS latest_status,
                   max(id) FILTER (WHERE latest_rank = 1) AS latest_alert_id,
                   max(queue_position) FILTER (WHERE latest_rank = 1) AS latest_queue_position
            FROM filtered
            GROUP BY account
        ), counted AS (
            SELECT *, count(*) OVER () AS full_count
            FROM aggregated
            {aggregate_filter}
        )
        SELECT * FROM counted
        ORDER BY {_SORT_SQL[sort]}
        LIMIT :limit OFFSET :offset
    """
    rows = (
        conn.execute(text(sql), {**params, "limit": size, "offset": (page - 1) * size})
        .mappings()
        .all()
    )
    items = [
        SuspiciousAccount(
            account=str(row["account"]),
            max_score=round(float(row["max_score"]) * 100, 1),
            latest_score=round(float(row["latest_score"]) * 100, 1),
            alert_weeks=row["alert_weeks"],
            first_week=row["first_week"],
            last_week=row["last_week"],
            total_flagged_amount=float(row["total_flagged_amount"]),
            country=row["country"],
            status=STATUS_TO_FRONT[row["latest_status"]],
            latest_alert_id=str(row["latest_alert_id"]),
        )
        for row in rows
    ]
    return items, int(rows[0]["full_count"]) if rows else 0


def account_alerts(conn: Connection, account: int) -> list[Alert]:
    rows = conn.execute(
        text(
            f"SELECT {ALERT_COLUMNS} FROM alerts a WHERE a.account = :account"
            " ORDER BY a.week DESC, a.id DESC"
        ),
        {"account": account},
    ).mappings()
    return [alert_from_row(row) for row in rows]
