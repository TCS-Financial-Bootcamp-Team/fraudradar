"""Semanas processadas pelo worker e replay da demonstração."""

from datetime import date

from pydantic import BaseModel, Field


class ProcessedWeek(BaseModel):
    week: date
    alerts: int = Field(ge=0)
    pending: int = Field(ge=0)


class Weeks(BaseModel):
    """Períodos processados, do mais recente ao mais antigo.

    `next_release` permanece no contrato como compatibilidade e sempre volta como None.
    """

    current: date | None
    next_release: date | None
    items: list[ProcessedWeek]


class Replay(BaseModel):
    """Espelha replaySchema do front."""

    week: date
    alerts_generated: int = Field(ge=0)
