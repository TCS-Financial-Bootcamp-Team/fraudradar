"""Todos os períodos já processados, com a contagem de alertas de cada um."""

from fastapi import APIRouter

from api.dependencies import DbConnection
from api.repositories.weeks import processed_weeks
from api.schemas.weeks import ProcessedWeek, Weeks

router = APIRouter(tags=["weeks"])


@router.get("/weeks", response_model=Weeks)
def list_weeks(conn: DbConnection) -> Weeks:
    """`current` é o período processado mais recente; não há porta de liberação."""
    items = [ProcessedWeek(**row) for row in processed_weeks(conn)]
    return Weeks(
        current=items[0].week if items else None,
        next_release=None,
        items=items,
    )
