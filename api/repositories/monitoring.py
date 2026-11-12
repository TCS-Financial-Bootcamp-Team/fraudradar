"""Números do monitoramento de uma semana.

O que muda com o trabalho do analista (revisados, comunicados) é contado em `alerts`; as taxas de
alerta por país e por meio de pagamento vêm prontas do worker em `weekly_batches.metrics`. O
recall e o acerto de tipologia que o worker também grava ali (avaliação de desenvolvimento,
contra o gabarito) não vão para as telas. A API nunca lê `ground_truth`.

Alerta, aqui, é a conta que passou do corte da fila (`alerts.origin = 'model'`). A amostra de
controle (`exploration`) fica fora de todas as contagens: o resultado dela aparece no retorno
dos analistas (`GET /feedback/summary`).
"""

import math
from datetime import date

from sqlalchemy import Connection, RowMapping, text

from api.domain import MODEL_ALERTS, STATUS_FROM_FRONT, UNDEFINED_COUNTRY, UNDEFINED_TYPOLOGY

WEEKS_IN_SERIES = 12
_MONTHS = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")


SCORE_HISTOGRAM_BINS = ("40", "50", "60", "70", "80", "90", "95", "100")


def clamp_rate(value: object) -> float | None:
    """Número entre 0 e 1 vindo do JSON do worker; qualquer outra coisa vira None."""
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return None
    return min(max(float(value), 0.0), 1.0)


def week_label(week: date) -> str:
    return f"{week.day:02d} {_MONTHS[week.month - 1]}"


def week_counts(conn: Connection, week: date) -> RowMapping:
    sql = f"""
        SELECT count(*) AS alerts,
               count(*) FILTER (WHERE a.status <> ALL(:pending)) AS reviewed,
               count(*) FILTER (WHERE r.alert_id IS NOT NULL) AS reported,
               COALESCE(sum(a.total_amount), 0) AS flagged_amount
        FROM alerts a
        LEFT JOIN (SELECT DISTINCT alert_id FROM reports WHERE status = 'approved') r
               ON r.alert_id = a.id
        WHERE a.week = :week AND {MODEL_ALERTS}
    """
    pending = list(STATUS_FROM_FRONT["pending"])
    return conn.execute(text(sql), {"week": week, "pending": pending}).mappings().one()


def get_batch(conn: Connection, week: date) -> RowMapping | None:
    sql = "SELECT active_accounts, metrics FROM weekly_batches WHERE week = :week"
    return conn.execute(text(sql), {"week": week}).mappings().first()


def alerts_by_week(conn: Connection, week: date) -> list[RowMapping]:
    """As últimas semanas processadas até `week`, em ordem cronológica."""
    sql = f"""
        SELECT b.week, count(a.id) AS alerts
        FROM weekly_batches b
        LEFT JOIN alerts a ON a.week = b.week AND {MODEL_ALERTS}
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
        WHERE a.week = :week AND {MODEL_ALERTS}
        GROUP BY 1
        ORDER BY value DESC, name
    """
    return list(conn.execute(text(sql), {"week": week, "undefined": undefined}).mappings())


def score_histogram(conn: Connection, week: date) -> list[dict[str, object]]:
    """Distribuição dos alertas da semana por faixas de score (em escala 0-100)."""
    sql = f"""
        SELECT
            count(*) FILTER (WHERE score < 0.5::real) AS "40",
            count(*) FILTER (WHERE score >= 0.5::real AND score < 0.6::real) AS "50",
            count(*) FILTER (WHERE score >= 0.6::real AND score < 0.7::real) AS "60",
            count(*) FILTER (WHERE score >= 0.7::real AND score < 0.8::real) AS "70",
            count(*) FILTER (WHERE score >= 0.8::real AND score < 0.9::real) AS "80",
            count(*) FILTER (WHERE score >= 0.9::real AND score < 0.95::real) AS "90",
            count(*) FILTER (WHERE score >= 0.95::real AND score < 0.9995::real) AS "95",
            count(*) FILTER (WHERE score >= 0.9995::real) AS "100"
        FROM alerts a
        WHERE a.week = :week AND {MODEL_ALERTS}
    """
    row = conn.execute(text(sql), {"week": week}).mappings().one()
    return [{"name": b, "value": int(row[b])} for b in SCORE_HISTOGRAM_BINS]


def status_counts(conn: Connection, week: date) -> RowMapping:
    """Contagem dos alertas da semana de referência agrupados por status do front."""
    sql = f"""
        SELECT
            count(*) FILTER (WHERE status IN ('new', 'in_review')) AS pending,
            count(*) FILTER (WHERE status = 'escalated') AS escalated,
            count(*) FILTER (WHERE status = 'archived') AS archived,
            count(*) FILTER (WHERE status = 'reported') AS reported
        FROM alerts a
        WHERE a.week = :week AND {MODEL_ALERTS}
    """
    return conn.execute(text(sql), {"week": week}).mappings().one()
