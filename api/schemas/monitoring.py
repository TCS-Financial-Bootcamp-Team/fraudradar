"""Contrato do monitoramento: espelha monitoringSchema em web/src/features/alerts/schemas.

Sem recall nem acerto de tipologia: uma plataforma de verdade não tem gabarito para medi-los. O
que os analistas confirmam está em ``GET /feedback/summary``; o recall medido contra o gabarito
fica só na validação de cada versão do modelo (``GET /datasets/{slug}/models``).
"""

from datetime import date

from pydantic import BaseModel, Field


class Series(BaseModel):
    name: str
    value: float = Field(ge=0)


class Indicators(BaseModel):
    alerts: int
    reviewed: int
    reported: int
    alert_rate: float = Field(ge=0, le=1)
    flagged_amount: float


class StatusCounts(BaseModel):
    pending: int = Field(ge=0)
    escalated: int = Field(ge=0)
    archived: int = Field(ge=0)
    reported: int = Field(ge=0)


class Monitoring(BaseModel):
    week: date
    indicators: Indicators
    weeks: list[Series]
    typologies: list[Series]
    countries: list[Series]
    country_rates: list[Series]
    payment_type_rates: list[Series]
    score_histogram: list[Series]
    status_counts: StatusCounts
