"""Semanas processadas pelo worker e replay da demonstração."""

from datetime import date

from pydantic import BaseModel, Field


class SemanaProcessada(BaseModel):
    semana: date
    alertas: int = Field(ge=0)
    pendentes: int = Field(ge=0)


class Semanas(BaseModel):
    """Semanas já liberadas pelo replay, da mais recente para a mais antiga."""

    atual: date | None
    itens: list[SemanaProcessada]


class Replay(BaseModel):
    """Espelha replaySchema do front."""

    semana: date
    alertas_gerados: int = Field(ge=0)
