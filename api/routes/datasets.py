"""Catálogo de conjuntos de dados e solicitação de processamento."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from api.dependencies import CurrentUser, PublicDbConnection
from api.errors import AppError
from api.repositories import datasets as repository
from api.schemas.datasets import DatasetCreate, DatasetResponse, JobResponse
from fraudradar.datasets import (
    DatasetAlreadyExistsError,
    InvalidDatasetSlugError,
    create_dataset,
)

router = APIRouter(tags=["datasets"])


@router.get("/datasets", response_model=list[DatasetResponse])
def list_datasets(conn: PublicDbConnection) -> list[DatasetResponse]:
    return repository.list_datasets(conn)


@router.post("/datasets", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_empty_dataset(
    request: DatasetCreate, conn: PublicDbConnection, user: CurrentUser
) -> DatasetResponse:
    try:
        dataset = create_dataset(conn, name=request.name, slug=request.slug)
    except InvalidDatasetSlugError as exc:
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "dataset.invalid_slug", str(exc)
        ) from exc
    except DatasetAlreadyExistsError as exc:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "dataset.exists",
            f"O conjunto de dados '{request.slug}' já existe.",
            {"slug": request.slug},
        ) from exc
    except ValueError as exc:
        raise AppError(status.HTTP_422_UNPROCESSABLE_ENTITY, "dataset.invalid", str(exc)) from exc
    repository.audit_dataset_created(conn, dataset, user)
    return DatasetResponse(
        slug=dataset.slug,
        name=dataset.name,
        origin=dataset.origin,
        active_model_version=dataset.active_model_version,
        created_at=dataset.created_at,
    )


@router.post(
    "/datasets/{slug}/process",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def process_dataset(slug: str, conn: PublicDbConnection, user: CurrentUser) -> JobResponse:
    return repository.enqueue_process(conn, slug, user)


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(
    conn: PublicDbConnection,
    dataset: Annotated[str | None, Query(min_length=1, max_length=40)] = None,
) -> list[JobResponse]:
    return repository.list_jobs(conn, dataset)


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: int, conn: PublicDbConnection) -> JobResponse:
    return repository.get_job(conn, job_id)
