"""Configuração do agendador, simulador e remoção segura de simulações."""

import json

from fastapi import status
from sqlalchemy import Connection, text

from api.dependencies import User
from api.errors import AppError
from api.repositories.datasets import _job_response
from api.schemas.datasets import JobResponse
from api.schemas.processing import ProcessingSettings, ProcessingSettingsUpdate, SimulationRequest
from fraudradar.datasets import (
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)


def _dataset_or_404(conn: Connection, slug: str):
    try:
        return resolve_dataset(conn, slug)
    except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "dataset.not_found",
            f"Conjunto de dados '{slug}' não encontrado.",
            {"slug": slug},
        ) from exc


def get_settings(conn: Connection, slug: str) -> ProcessingSettings:
    dataset = _dataset_or_404(conn, slug)
    conn.execute(
        text(
            "INSERT INTO public.processing_settings (dataset) VALUES (:dataset)"
            " ON CONFLICT (dataset) DO NOTHING"
        ),
        {"dataset": dataset.slug},
    )
    row = (
        conn.execute(
            text("SELECT * FROM public.processing_settings WHERE dataset = :dataset"),
            {"dataset": dataset.slug},
        )
        .mappings()
        .one()
    )
    return ProcessingSettings(**row)


def update_settings(
    conn: Connection, slug: str, request: ProcessingSettingsUpdate, user: User
) -> ProcessingSettings:
    dataset = _dataset_or_404(conn, slug)
    row = (
        conn.execute(
            text(
                "INSERT INTO public.processing_settings"
                " (dataset, interval_minutes, enabled, demo_mode, exploration_per_week,"
                " next_run_at, updated_at)"
                " VALUES (:dataset, :interval, :enabled, :demo, :exploration,"
                " now() + make_interval(mins => :interval), now())"
                " ON CONFLICT (dataset) DO UPDATE SET"
                " interval_minutes = EXCLUDED.interval_minutes, enabled = EXCLUDED.enabled,"
                " demo_mode = EXCLUDED.demo_mode,"
                " exploration_per_week = EXCLUDED.exploration_per_week,"
                " next_run_at = CASE WHEN EXCLUDED.enabled"
                "   THEN now() + make_interval(mins => EXCLUDED.interval_minutes)"
                "   ELSE public.processing_settings.next_run_at END, updated_at = now()"
                " RETURNING *"
            ),
            {
                "dataset": dataset.slug,
                "interval": request.interval_minutes,
                "enabled": request.enabled,
                "demo": request.demo_mode,
                "exploration": request.exploration_per_week,
            },
        )
        .mappings()
        .one()
    )
    use_dataset(conn, dataset)
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
            " VALUES (:actor, 'processing_settings_updated', 'dataset', :dataset,"
            " CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "dataset": dataset.slug,
            "details": json.dumps({**request.model_dump(), "user_id": user.id}),
        },
    )
    return ProcessingSettings(**row)


def enqueue_simulation(
    conn: Connection, slug: str, request: SimulationRequest, user: User
) -> JobResponse:
    dataset = _dataset_or_404(conn, slug)
    row = (
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by)"
                " VALUES ('simulate', :dataset, CAST(:payload AS jsonb), :actor) RETURNING *"
            ),
            {
                "dataset": dataset.slug,
                "payload": json.dumps(request.model_dump()),
                "actor": user.name,
            },
        )
        .mappings()
        .one()
    )
    use_dataset(conn, dataset)
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
            " VALUES (:actor, 'simulation_enqueued', 'job', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "id": str(row["id"]),
            "details": json.dumps({"dataset": dataset.slug, "user_id": user.id}),
        },
    )
    return _job_response(row)


def delete_simulation(
    conn: Connection, ingestion_id: int, dataset_slug: str, user: User
) -> JobResponse:
    ingestion = (
        conn.execute(
            text("SELECT id, source FROM ingestions WHERE id = :id FOR UPDATE"),
            {"id": ingestion_id},
        )
        .mappings()
        .first()
    )
    if ingestion is None:
        raise AppError(status.HTTP_404_NOT_FOUND, "ingestion.not_found", "Ingestão não encontrada.")
    if ingestion["source"] != "simulation":
        raise AppError(
            status.HTTP_409_CONFLICT,
            "simulation.only_simulated",
            "Somente uma ingestão criada pelo simulador pode ser apagada.",
        )
    weeks = list(
        conn.execute(
            text(
                "SELECT DISTINCT CAST(date_trunc('week', occurred_at) AS date)"
                " FROM transactions WHERE ingestion_id = :id ORDER BY 1"
            ),
            {"id": ingestion_id},
        ).scalars()
    )
    latest_week = conn.execute(
        text("SELECT CAST(date_trunc('week', max(occurred_at)) AS date) FROM transactions")
    ).scalar()
    closed = [week for week in weeks if latest_week is not None and week < latest_week]
    if closed:
        listed = ", ".join(week.isoformat() for week in closed)
        raise AppError(
            status.HTTP_409_CONFLICT,
            "simulation.reaches_closed_period",
            f"A simulação não pode ser apagada porque alcança período fechado: {listed}.",
            {"weeks": listed},
        )
    decided = conn.execute(
        text(
            "WITH touched AS ("
            " SELECT sender AS account, CAST(date_trunc('week', occurred_at) AS date) AS week"
            " FROM transactions WHERE ingestion_id = :id"
            " UNION SELECT receiver, CAST(date_trunc('week', occurred_at) AS date)"
            " FROM transactions WHERE ingestion_id = :id)"
            " SELECT count(DISTINCT a.id) FROM touched t"
            " JOIN alerts a ON a.account = t.account AND a.week = t.week"
            " JOIN decisions d ON d.alert_id = a.id"
        ),
        {"id": ingestion_id},
    ).scalar_one()
    if decided:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "simulation.has_decisions",
            "A simulação não pode ser apagada porque há decisão de analista em alerta afetado.",
        )
    conn.execute(text("DELETE FROM transactions WHERE ingestion_id = :id"), {"id": ingestion_id})
    conn.execute(text("DELETE FROM ingestions WHERE id = :id"), {"id": ingestion_id})
    # O período aberto é recalculado pelo `process` (preservando decisões). Só o que ficou sem
    # nenhuma transação não seria revisitado: some junto com o lote.
    for week in weeks:
        remaining = conn.execute(
            text(
                "SELECT 1 FROM transactions WHERE occurred_at >= :start"
                " AND occurred_at < CAST(:start AS timestamp) + INTERVAL '7 days' LIMIT 1"
            ),
            {"start": week},
        ).scalar()
        if remaining is None:
            conn.execute(text("DELETE FROM alerts WHERE week = :week"), {"week": week})
            conn.execute(text("DELETE FROM weekly_batches WHERE week = :week"), {"week": week})
    row = (
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by)"
                " VALUES ('process', :dataset, '{}'::jsonb, :actor) RETURNING *"
            ),
            {"dataset": dataset_slug, "actor": user.name},
        )
        .mappings()
        .one()
    )
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
            " VALUES (:actor, 'simulation_deleted', 'ingestion', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "id": str(ingestion_id),
            "details": json.dumps(
                {"weeks": [week.isoformat() for week in weeks], "user_id": user.id}
            ),
        },
    )
    return _job_response(row)
