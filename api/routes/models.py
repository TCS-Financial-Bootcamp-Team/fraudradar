"""Versões do modelo por conjunto de dados: listar, pedir retreino e promover."""

from fastapi import APIRouter, status

from api.dependencies import CurrentUser, PublicDbConnection
from api.repositories import models as repository
from api.schemas.datasets import JobResponse
from api.schemas.models import ModelsResponse

router = APIRouter(tags=["models"])


@router.get("/datasets/{slug}/models", response_model=ModelsResponse)
def list_models(slug: str, conn: PublicDbConnection) -> ModelsResponse:
    return repository.list_models(conn, slug)


@router.post(
    "/datasets/{slug}/train",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def train_dataset(slug: str, conn: PublicDbConnection, user: CurrentUser) -> JobResponse:
    return repository.enqueue_train(conn, slug, user)


@router.post("/datasets/{slug}/models/{version}/promote", response_model=ModelsResponse)
def promote_model(
    slug: str, version: str, conn: PublicDbConnection, user: CurrentUser
) -> ModelsResponse:
    return repository.promote(conn, slug, version, user)
