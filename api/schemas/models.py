"""Contratos das versões do modelo de cada conjunto de dados (espelham o zod de
``web/src/features/models/schemas/models.ts``)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from api.schemas.datasets import JobResponse


class ModelMetrics(BaseModel):
    """Métricas medidas no período de teste da divisão no tempo; ``None`` quando a ficha não as
    tem ou não deu para calcular."""

    pr_auc: float | None
    recall_at_fpr: float | None
    f1: float | None
    queue_recall: float | None
    queue_precision: float | None
    innocents_per_week: float | None


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


class ModelsResponse(BaseModel):
    dataset: str
    active_version: str | None
    versions: list[ModelVersion]
    can_train: bool
    train_blocked_reason: str | None
    training_job: JobResponse | None
