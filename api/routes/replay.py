"""Replay da demonstração: libera para a fila a próxima semana já processada.

A API não roda o modelo (a imagem dela não tem lightgbm): o worker processa as semanas
antes (`docker compose run --rm worker batch --week AAAA-MM-DD`) e o replay só as revela.
"""

from fastapi import APIRouter, status

from api.dependencies import CurrentUser, DbConnection
from api.errors import AppError
from api.repositories.weeks import release_next_week
from api.schemas.weeks import Replay

router = APIRouter(prefix="/replay", tags=["replay"])

NO_BATCH_AVAILABLE = (
    "Não há semana processada para liberar. Rode o worker: "
    "docker compose run --rm worker batch --week AAAA-MM-DD"
)


@router.post(
    "/next-week", response_model=Replay, responses={409: {"description": NO_BATCH_AVAILABLE}}
)
def next_week(conn: DbConnection, user: CurrentUser) -> Replay:
    released = release_next_week(conn, user)
    if released is None:
        raise AppError(status.HTTP_409_CONFLICT, "replay.no_batch", NO_BATCH_AVAILABLE)
    week, alerts = released
    return Replay(week=week, alerts_generated=alerts)
