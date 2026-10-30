"""Semanas processadas pelo worker e replay da demonstração."""

from datetime import date

from pydantic import BaseModel, Field


class ProcessedWeek(BaseModel):
    week: date
    alerts: int = Field(ge=0)
    pending: int = Field(ge=0)


class Weeks(BaseModel):
    """Semanas já liberadas pelo replay, da mais recente para a mais antiga."""

    current: date | None
    items: list[ProcessedWeek]


class Replay(BaseModel):
    """Espelha replaySchema do front."""

    week: date
    alerts_generated: int = Field(ge=0)
