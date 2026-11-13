"""Contratos das versões do modelo de cada conjunto de dados (espelham o zod de
``web/src/features/models/schemas/models.ts``)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, model_validator

from api.schemas.datasets import JobResponse


class ModelMetrics(BaseModel):
    """Métricas de validação, medidas no período de teste da divisão no tempo (dados rotulados);
    ``None`` quando a ficha não as tem ou não deu para calcular."""

    pr_auc: float | None
    recall_at_fpr: float | None
    f1: float | None
    queue_recall: float | None
    queue_precision: float | None
    innocents_per_week: float | None


class ComparisonMetrics(BaseModel):
    pr_auc: float | None = None
    queue_recall: float | None = None
    queue_precision: float | None = None
    innocents_per_week: float | None = None


class ComparisonPeriod(BaseModel):
    start: date | None = None
    end: date | None = None
    weeks: int = 0


class PromotionGate(BaseModel):
    """A trava de promoção: a versão nova não pode achar menos lavadoras na fila que a ativa no
    mesmo período de teste (com uma folga de ``tolerance``)."""

    passed: bool
    reason: str | None = None


class ModelComparison(BaseModel):
    """A versão nova e a versão ativa (no momento do treino) medidas nas mesmas semanas de teste,
    fora da amostra das duas."""

    active_version: str
    period: ComparisonPeriod
    candidate: ComparisonMetrics
    active: ComparisonMetrics
    recall_difference: float | None = None
    tolerance: float
    gate: PromotionGate


class LabelBreakdown(BaseModel):
    """Rótulos do retorno dos analistas por classe, fonte e origem do alerta."""

    total: int = 0
    laundering: int = 0  # lavagem confirmada
    false_positive: int = 0  # falso positivo confirmado
    analyst: int = 0
    simulated: int = 0
    model: int = 0  # alertas da fila do modelo
    exploration: int = 0  # alertas da amostra de controle


class FeedbackUsage(BaseModel):
    """O retorno dos analistas que uma versão usou no treino (bloco ``feedback`` da ficha)."""

    used: bool
    include_simulated: bool = False
    labels: LabelBreakdown | None = None  # os que pesaram no treino
    labels_in_validation: int = 0
    labels_reserved_for_test: int = 0
    transactions_covered: int = 0
    transactions_weighted: int = 0
    transactions_without_truth: int = 0
    conflicts: int = 0
    split: Literal["feedback", "official", "proportional"] | None = None


class ModelVersion(BaseModel):
    version: str
    # "official" = modelo oficial treinado do CSV; "dataset" = retreino deste conjunto.
    source: Literal["official", "dataset"]
    created_at: datetime | None
    trees: int | None
    history_start: str | None
    train_end: str | None
    metrics: ModelMetrics
    active: bool
    comparison: ModelComparison | None = None
    feedback: FeedbackUsage | None = None


class FeedbackClassCounts(BaseModel):
    laundering: int = 0
    false_positive: int = 0


class TrainingFeedback(BaseModel):
    """O retorno disponível para um retreino (rótulos de períodos fechados) e por que ele não
    pode ser usado, com e sem o retorno simulado; ``None`` = pode."""

    analyst: FeedbackClassCounts
    simulated: FeedbackClassCounts
    blocked_reason: str | None
    blocked_reason_with_simulated: str | None


class ModelsResponse(BaseModel):
    dataset: str
    active_version: str | None
    versions: list[ModelVersion]
    can_train: bool
    train_blocked_reason: str | None
    training_job: JobResponse | None
    training_feedback: TrainingFeedback


class TrainRequest(BaseModel):
    """Pedido de retreino. ``use_feedback``: o retorno dos analistas entra como sinal a mais;
    ``include_simulated``: com ele, também o do analista simulado."""

    use_feedback: bool = False
    include_simulated: bool = False

    @model_validator(mode="after")
    def _simulated_needs_feedback(self) -> "TrainRequest":
        if self.include_simulated and not self.use_feedback:
            raise ValueError(
                "O retorno simulado só entra num retreino com o retorno dos analistas."
            )
        return self
