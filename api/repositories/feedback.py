"""Números do retorno dos analistas, lidos de ``analyst_labels`` e ``alerts``.

A API nunca lê ``ground_truth``: aqui só entra o que os analistas (e o analista simulado da
demonstração, separado por ``source``) decidiram. Os rótulos da amostra de controle
(``origin = 'exploration'``) medem o que o modelo deixa passar e ficam fora da precisão
confirmada, que é da fila do modelo.
"""

import math
from datetime import date, datetime
from typing import Any

from sqlalchemy import Connection, text

from api.repositories.models import _catalog, _created_at, get_dataset
from api.repositories.monitoring import week_label
from api.schemas.feedback import ControlSample, FeedbackSummary, Rate, RetrainStatus, WeeklyRate
from api.schemas.models import LabelBreakdown
from fraudradar.model.eligibility import training_block_reason
from fraudradar.model.feedback import closed_label_counts, feedback_block_reason

# Abaixo disto o percentual ainda diz pouco: a tela avisa que a amostra é pequena.
LOW_SAMPLE = 20


def rate(numerator: int, denominator: int) -> Rate:
    value = numerator / denominator if denominator else None
    if value is not None and not math.isfinite(value):
        value = None
    return Rate(
        value=value,
        numerator=numerator,
        denominator=denominator,
        low_sample=denominator < LOW_SAMPLE,
    )


def _range(start: date | None, end: date | None) -> tuple[str, dict[str, Any]]:
    """Filtro das semanas (``l`` = analyst_labels ou ``a`` = alerts, coluna ``week``)."""
    return (
        "(CAST(:start AS date) IS NULL OR {t}.week >= :start)"
        " AND (CAST(:end AS date) IS NULL OR {t}.week <= :end)",
        {"start": start, "end": end},
    )


def _labels(conn: Connection, where: str, params: dict) -> LabelBreakdown:
    row = (
        conn.execute(
            text(
                f"""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE label = 1) AS laundering,
                       count(*) FILTER (WHERE label = 0) AS false_positive,
                       count(*) FILTER (WHERE source = 'analyst') AS analyst,
                       count(*) FILTER (WHERE source = 'simulated') AS simulated,
                       count(*) FILTER (WHERE origin = 'model') AS model,
                       count(*) FILTER (WHERE origin = 'exploration') AS exploration
                FROM analyst_labels l WHERE {where}
                """
            ),
            params,
        )
        .mappings()
        .one()
    )
    return LabelBreakdown(**row)


def _weekly(conn: Connection, where: str, params: dict) -> list[WeeklyRate]:
    rows = conn.execute(
        text(
            f"""
            SELECT week, count(*) FILTER (WHERE label = 1) AS confirmed, count(*) AS decided
            FROM analyst_labels l WHERE {where} AND l.origin = 'model'
            GROUP BY week ORDER BY week
            """
        ),
        params,
    ).mappings()
    return [
        WeeklyRate(
            week=row["week"],
            name=week_label(row["week"]),
            **rate(row["confirmed"], row["decided"]).model_dump(),
        )
        for row in rows
    ]


def _control_sample(conn: Connection, params: dict) -> ControlSample:
    where = _range(params["start"], params["end"])[0].format(t="a")
    row = (
        conn.execute(
            text(
                f"""
                SELECT count(*) AS sampled,
                       count(l.alert_id) AS reviewed,
                       count(*) FILTER (WHERE l.label = 1) AS found
                FROM alerts a LEFT JOIN analyst_labels l ON l.alert_id = a.id
                WHERE a.origin = 'exploration' AND {where}
                """
            ),
            params,
        )
        .mappings()
        .one()
    )
    return ControlSample(
        sampled=row["sampled"],
        reviewed=row["reviewed"],
        found_outside_queue=rate(row["found"], row["reviewed"]),
    )


def _active_training_time(slug: str, conn: Connection) -> tuple[str | None, datetime | None]:
    """A versão ativa do conjunto e quando ela foi treinada (``created_at`` da ficha). Ficha antiga,
    sem fuso, vale no fuso deste servidor."""
    dataset = get_dataset(conn, slug)
    own, official = _catalog(dataset)
    if dataset.active_model_version is not None:
        name, card = dataset.active_model_version, own.get(dataset.active_model_version)
    elif official is not None:
        name, card = official
    else:
        return None, None
    trained = None if card is None else _created_at(card)
    if trained is not None and trained.tzinfo is None:
        trained = trained.astimezone()
    return name, trained


def _retrain(conn: Connection, slug: str) -> RetrainStatus:
    base = training_block_reason(conn, slug)
    if base is None:
        running = conn.execute(
            text(
                "SELECT 1 FROM public.jobs WHERE kind = 'train' AND dataset = :slug"
                " AND status IN ('queued', 'running') LIMIT 1"
            ),
            {"slug": slug},
        ).scalar()
        if running:
            base = "Já existe um treino em andamento para este conjunto."
    counts = closed_label_counts(conn)
    reason = base or feedback_block_reason(counts, include_simulated=False)
    with_simulated = base or feedback_block_reason(counts, include_simulated=True)
    return RetrainStatus(
        can_retrain=reason is None,
        reason=reason,
        can_retrain_with_simulated=with_simulated is None,
        reason_with_simulated=with_simulated,
    )


def summary(conn: Connection, slug: str, start: date | None, end: date | None) -> FeedbackSummary:
    where, params = _range(start, end)
    labels_where = where.format(t="l")
    labels = _labels(conn, labels_where, params)
    confirmed = conn.execute(
        text(
            "SELECT count(*) FILTER (WHERE label = 1), count(*) FROM analyst_labels l"
            f" WHERE {labels_where} AND l.origin = 'model'"
        ),
        params,
    ).one()
    active, trained = _active_training_time(slug, conn)
    new_since = conn.execute(
        text(
            "SELECT count(*) FROM analyst_labels"
            " WHERE CAST(:since AS timestamptz) IS NULL OR created_at > :since"
        ),
        {"since": trained},
    ).scalar_one()
    return FeedbackSummary(
        start=start,
        end=end,
        labels=labels,
        confirmed_precision=rate(confirmed[0], confirmed[1]),
        weekly_confirmed_precision=_weekly(conn, labels_where, params),
        control_sample=_control_sample(conn, params),
        active_version=active,
        new_since_active=new_since,
        retrain=_retrain(conn, slug),
    )
