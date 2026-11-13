"""Contrato do retorno dos analistas (``GET /feedback/summary``): espelha
``web/src/features/feedback/schemas/feedback.ts``.

São os números que uma plataforma real consegue medir sem gabarito: o que os analistas
confirmaram nos alertas e o que a amostra de controle achou fora da fila. Percentual calculado
sobre menos de 20 casos vem com ``low_sample = true``.
"""

from datetime import date

from pydantic import BaseModel, Field

from api.schemas.models import LabelBreakdown


class Rate(BaseModel):
    value: float | None = Field(default=None, ge=0, le=1)  # None = nenhum caso ainda
    numerator: int = Field(ge=0)
    denominator: int = Field(ge=0)
    low_sample: bool


class WeeklyRate(Rate):
    week: date
    name: str  # rótulo curto da semana ("22 mai"), como no monitoramento


class ControlSample(BaseModel):
    """Amostra de controle: contas sorteadas fora da fila, revisadas pelos analistas."""

    sampled: int = Field(ge=0)  # contas sorteadas no período
    reviewed: int = Field(ge=0)  # com decisão conclusiva (deixou rótulo)
    found_outside_queue: Rate  # lavagem confirmada entre as revisadas


class RetrainStatus(BaseModel):
    """Se o conjunto pode retreinar com o retorno e, se não, por quê (com e sem o simulado)."""

    can_retrain: bool
    reason: str | None
    can_retrain_with_simulated: bool
    reason_with_simulated: str | None


class FeedbackSummary(BaseModel):
    start: date | None
    end: date | None
    labels: LabelBreakdown
    # Alertas da fila do modelo confirmados como lavagem ÷ alertas da fila com decisão conclusiva.
    confirmed_precision: Rate
    weekly_confirmed_precision: list[WeeklyRate]
    control_sample: ControlSample
    active_version: str | None
    new_since_active: int = Field(ge=0)  # rótulos criados depois do treino da versão ativa
    retrain: RetrainStatus
