"""Configuração do processamento automático e pedido do simulador."""

from datetime import datetime

from pydantic import BaseModel, Field


class ProcessingSettingsUpdate(BaseModel):
    interval_minutes: int = Field(ge=5, le=1440)
    enabled: bool
    demo_mode: bool


class ProcessingSettings(ProcessingSettingsUpdate):
    dataset: str
    last_run_at: datetime | None
    next_run_at: datetime


class SimulationRequest(BaseModel):
    transactions: int = Field(ge=50, le=5000)
    days: int = Field(ge=1, le=7)
    inject_pattern: bool = False
