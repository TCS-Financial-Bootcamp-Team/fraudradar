"""Semanas já liberadas pelo replay, com a contagem de alertas de cada uma."""

from fastapi import APIRouter

from api.dependencies import DbConnection
from api.repositories.weeks import next_release, released_weeks
from api.schemas.weeks import ProcessedWeek, Weeks

router = APIRouter(tags=["weeks"])


@router.get("/weeks", response_model=Weeks)
def list_weeks(conn: DbConnection) -> Weeks:
    """`current` é a semana liberada mais recente: o ponto de partida do front. As semanas
    de `items` são as únicas que o front deixa escolher; `next_release` liga o botão do replay."""
    items = [ProcessedWeek(**row) for row in released_weeks(conn)]
    return Weeks(
        current=items[0].week if items else None,
        next_release=next_release(conn),
        items=items,
    )
