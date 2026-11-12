"""Processamento automático, simulador e remoção de simulações."""

from typing import Annotated

from fastapi import APIRouter, Header, status

from api.dependencies import CurrentUser, DbConnection, PublicDbConnection
from api.repositories import processing as repository
from api.schemas.datasets import JobResponse
from api.schemas.processing import ProcessingSettings, ProcessingSettingsUpdate, SimulationRequest

router = APIRouter(tags=["processing"])


@router.get("/processing/settings", response_model=ProcessingSettings)
def get_processing_settings(
    conn: PublicDbConnection,
    dataset: Annotated[str, Header(alias="X-Dataset")] = "saml-d",
) -> ProcessingSettings:
    return repository.get_settings(conn, dataset)


@router.put("/processing/settings", response_model=ProcessingSettings)
def update_processing_settings(
    request: ProcessingSettingsUpdate,
    conn: PublicDbConnection,
    user: CurrentUser,
    dataset: Annotated[str, Header(alias="X-Dataset")] = "saml-d",
) -> ProcessingSettings:
    return repository.update_settings(conn, dataset, request, user)


@router.post(
    "/datasets/{slug}/simulate",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def simulate_dataset(
    slug: str, request: SimulationRequest, conn: PublicDbConnection, user: CurrentUser
) -> JobResponse:
    return repository.enqueue_simulation(conn, slug, request, user)


@router.delete(
    "/ingestions/{ingestion_id}",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def delete_simulation(
    ingestion_id: int,
    conn: DbConnection,
    user: CurrentUser,
    dataset: Annotated[str, Header(alias="X-Dataset")] = "saml-d",
) -> JobResponse:
    return repository.delete_simulation(conn, ingestion_id, dataset, user)
