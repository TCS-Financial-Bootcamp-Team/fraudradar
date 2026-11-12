"""Números do monitoramento de uma semana.

O que muda com o trabalho do analista (revisados, comunicados) é contado em `alerts`;
a avaliação contra o gabarito (recall, acerto, taxas) vem pronta do worker em
`weekly_batches.metrics`: a API nunca lê `ground_truth`.
"""

import math
from datetime import date

from sqlalchemy import Connection, RowMapping, text

from api.domain import STATUS_FROM_FRONT, UNDEFINED_COUNTRY, UNDEFINED_TYPOLOGY

WEEKS_IN_SERIES = 12
_MONTHS = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")


def clamp_rate(value: object) -> float:
    """Número entre 0 e 1 vindo do JSON do worker; qualquer outra coisa vira 0."""
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return 0.0
    return min(max(float(value), 0.0), 1.0)


def week_label(week: date) -> str:
    return f"{week.day:02d} {_MONTHS[week.month - 1]}"


def week_counts(conn: Connection, week: date) -> RowMapping:
    sql = """
        SELECT count(*) AS alerts,
               count(*) FILTER (WHERE a.status <> ALL(:pending)) AS reviewed,
               count(*) FILTER (WHERE r.alert_id IS NOT NULL) AS reported,
               COALESCE(sum(a.total_amount), 0) AS flagged_amount
        FROM alerts a
        LEFT JOIN (SELECT DISTINCT alert_id FROM reports WHERE status = 'approved') r
               ON r.alert_id = a.id
        WHERE a.week = :week
    """
    pending = list(STATUS_FROM_FRONT["pending"])
    return conn.execute(text(sql), {"week": week, "pending": pending}).mappings().one()


def get_batch(conn: Connection, week: date) -> RowMapping | None:
    sql = "SELECT active_accounts, metrics FROM weekly_batches WHERE week = :week"
    return conn.execute(text(sql), {"week": week}).mappings().first()


def alerts_by_week(conn: Connection, week: date) -> list[RowMapping]:
    """As últimas semanas processadas até `week`, em ordem cronológica."""
    sql = """
        SELECT b.week, count(a.id) AS alerts
        FROM weekly_batches b
        LEFT JOIN alerts a ON a.week = b.week
        WHERE b.week <= :week
        GROUP BY b.week
        ORDER BY b.week DESC
        LIMIT :limit
    """
    rows = conn.execute(text(sql), {"week": week, "limit": WEEKS_IN_SERIES}).mappings()
    return list(reversed(list(rows)))


def distribution(conn: Connection, week: date, by: str) -> list[RowMapping]:
    """Alertas da semana por tipologia prevista ou por país principal."""
    expressions = {
        "typology": "COALESCE(a.typology, :undefined)",
        "country": "COALESCE(a.countries[1], :undefined)",
    }
    undefined = UNDEFINED_TYPOLOGY if by == "typology" else UNDEFINED_COUNTRY
    sql = f"""
        SELECT {expressions[by]} AS name, count(*) AS value
        FROM alerts a
        WHERE a.week = :week
        GROUP BY 1
        ORDER BY value DESC, name
    """
    return list(conn.execute(text(sql), {"week": week, "undefined": undefined}).mappings())


# ============================================================
# INDICADORES ADICIONAIS DO DASHBOARD
# ============================================================


def recall_by_week(conn: Connection, week: date) -> list[dict]:
    """Recall das semanas liberadas ate a semana selecionada."""
    query = """
        SELECT week, metrics
        FROM weekly_batches
        WHERE week <= :week
          AND released_at IS NOT NULL
        ORDER BY week DESC
        LIMIT :limit
    """

    rows = conn.execute(
        text(query),
        {"week": week, "limit": WEEKS_IN_SERIES},
    ).mappings().all()

    result = []

    for row in reversed(rows):
        metrics = row["metrics"]

        if not isinstance(metrics, dict):
            continue

        value = metrics.get("recall")

        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            continue

        result.append(
            {
                "name": week_label(row["week"]),
                "value": clamp_rate(value),
            }
        )

    return result


def score_histogram(conn: Connection, week: date) -> list[dict]:
    """Oito faixas de score dos alertas da semana.

    Os scores do PostgreSQL estao na escala 0 a 1.
    As faixas apresentadas no frontend usam 0 a 100.
    """
    query = """
        SELECT
            COUNT(*) FILTER (
                WHERE score < 0.50
            ) AS b40,
            COUNT(*) FILTER (
                WHERE score >= 0.50
                  AND score < 0.60
            ) AS b50,
            COUNT(*) FILTER (
                WHERE score >= 0.60
                  AND score < 0.70
            ) AS b60,
            COUNT(*) FILTER (
                WHERE score >= 0.70
                  AND score < 0.80
            ) AS b70,
            COUNT(*) FILTER (
                WHERE score >= 0.80
                  AND score < 0.90
            ) AS b80,
            COUNT(*) FILTER (
                WHERE score >= 0.90
                  AND score < 0.95
            ) AS b90,
            COUNT(*) FILTER (
                WHERE score >= 0.95
                  AND score < 0.9995
            ) AS b95,
            COUNT(*) FILTER (
                WHERE score >= 0.9995
            ) AS b100
        FROM alerts
        WHERE week = :week
    """

    row = conn.execute(
        text(query),
        {"week": week},
    ).mappings().one()

    buckets = (
        ("40", "b40"),
        ("50", "b50"),
        ("60", "b60"),
        ("70", "b70"),
        ("80", "b80"),
        ("90", "b90"),
        ("95", "b95"),
        ("100", "b100"),
    )

    return [
        {"name": name, "value": int(row[column])}
        for name, column in buckets
    ]


def status_counts(conn: Connection, week: date) -> dict[str, int]:
    """Contagem pelos status publicos usados pelo frontend."""
    query = """
        SELECT status, COUNT(*) AS quantity
        FROM alerts
        WHERE week = :week
        GROUP BY status
    """

    rows = conn.execute(
        text(query),
        {"week": week},
    ).mappings().all()

    result = {
        "pending": 0,
        "escalated": 0,
        "archived": 0,
        "reported": 0,
    }

    mapping = {
        internal_status: public_status
        for public_status, internal_statuses
        in STATUS_FROM_FRONT.items()
        for internal_status in internal_statuses
    }

    for row in rows:
        internal_status = row["status"]

        if internal_status not in mapping:
            raise ValueError(
                f"Status desconhecido: {internal_status!r}"
            )

        public_status = mapping[internal_status]
        result[public_status] += int(row["quantity"])

    return result
