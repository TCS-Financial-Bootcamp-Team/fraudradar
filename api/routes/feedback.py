"""Retorno dos analistas: o que eles confirmaram e o que a amostra de controle achou.

- GET /feedback/summary?from=&to=  — rótulos, precisão confirmada, amostra de controle e se o
  conjunto pode retreinar com o retorno (conjunto pelo cabeçalho X-Dataset)
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Header, Query

from api.dependencies import DbConnection
from api.domain import week_start
from api.repositories import feedback as repository
from api.schemas.feedback import FeedbackSummary

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.get("/summary", response_model=FeedbackSummary)
def feedback_summary(
    conn: DbConnection,
    dataset: Annotated[str, Header(alias="X-Dataset")] = "saml-d",
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> FeedbackSummary:
    """As semanas de ``from`` a ``to`` (datas quaisquer: vale a segunda da semana)."""
    return repository.summary(
        conn,
        dataset,
        None if start is None else week_start(start),
        None if end is None else week_start(end),
    )
