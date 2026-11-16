"""Registro global de conjuntos de dados e fila de trabalhos."""

import json

from fastapi import status
from sqlalchemy import Connection, text

from api.dependencies import User
from api.errors import AppError
from api.schemas.datasets import DatasetResponse, JobResponse
from fraudradar.datasets import (
    Dataset,
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)


def list_datasets(conn: Connection) -> list[DatasetResponse]:
    rows = conn.execute(
        text(
            "SELECT slug, name, origin, active_model_version, created_at "
            "FROM public.datasets ORDER BY created_at, slug"
        )
    ).mappings()
    return [DatasetResponse(**row) for row in rows]


def audit_dataset_created(conn: Connection, dataset: Dataset, user: User) -> None:
    conn.execute(
        text(
            "INSERT INTO public.audit_log (actor, action, entity, entity_id, details) "
            "VALUES (:actor, 'dataset_created', 'dataset', :slug, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "slug": dataset.slug,
            "details": json.dumps(
                {"name": dataset.name, "origin": dataset.origin, "user_id": user.id}
            ),
        },
    )


def enqueue_process(conn: Connection, slug: str, user: User) -> JobResponse:
    try:
        dataset = resolve_dataset(conn, slug)
    except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "dataset.not_found",
            f"Conjunto de dados '{slug}' não encontrado.",
            {"slug": slug},
        ) from exc
    row = (
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by) "
                "VALUES ('process', :dataset, '{}'::jsonb, :actor) RETURNING *"
            ),
            {"dataset": dataset.slug, "actor": user.name},
        )
        .mappings()
        .one()
    )
    use_dataset(conn, dataset)
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details) "
            "VALUES (:actor, 'process_enqueued', 'job', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "id": str(row["id"]),
            "details": json.dumps({"dataset": dataset.slug, "user_id": user.id}),
        },
    )
    return _job_response(row)


def _job_response(row) -> JobResponse:
    return JobResponse(
        id=str(row["id"]),
        kind=row["kind"],
        dataset=row["dataset"],
        status=row["status"],
        progress=row["progress"],
        message=row["message"],
        message_code=row.get("message_code"),
        message_params=row.get("message_params"),
        created_at=row["created_at"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
    )


def get_job(conn: Connection, job_id: int) -> JobResponse:
    row = (
        conn.execute(text("SELECT * FROM public.jobs WHERE id = :id"), {"id": job_id})
        .mappings()
        .first()
    )
    if row is None:
        raise AppError(status.HTTP_404_NOT_FOUND, "job.not_found", "Trabalho não encontrado.")
    return _job_response(row)


def list_jobs(conn: Connection, dataset: str | None) -> list[JobResponse]:
    if dataset is not None:
        try:
            resolve_dataset(conn, dataset)
        except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
            raise AppError(
                status.HTTP_404_NOT_FOUND,
                "dataset.not_found",
                f"Conjunto de dados '{dataset}' não encontrado.",
                {"slug": dataset},
            ) from exc
    sql = "SELECT * FROM public.jobs"
    params = {}
    if dataset is not None:
        sql += " WHERE dataset = :dataset"
        params["dataset"] = dataset
    sql += " ORDER BY created_at DESC, id DESC LIMIT 20"
    rows = conn.execute(text(sql), params).mappings()
    return [_job_response(row) for row in rows]
