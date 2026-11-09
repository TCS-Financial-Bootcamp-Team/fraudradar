"""Semanas processadas pelo worker e replay da demonstração."""

from datetime import date

from pydantic import BaseModel, Field


class ProcessedWeek(BaseModel):
    week: date
    alerts: int = Field(ge=0)
    pending: int = Field(ge=0)


class Weeks(BaseModel):
    """Semanas já liberadas pelo replay, da mais recente para a mais antiga.

    `next_release` é a semana que o próximo replay libera (processada pelo worker e ainda
    escondida); None quando não há nenhuma, e o replay responderia 409.
    """

    current: date | None
    next_release: date | None
    items: list[ProcessedWeek]


class Replay(BaseModel):
    """Espelha replaySchema do front."""

    week: date
    alerts_generated: int = Field(ge=0)
