"""Contratos da visão consolidada de contas suspeitas."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from api.schemas.alerts import Alert, AlertStatus


class SuspiciousAccount(BaseModel):
    account: str
    max_score: float = Field(ge=0, le=100)
    latest_score: float = Field(ge=0, le=100)
    alert_weeks: int = Field(ge=1)
    first_week: date
    last_week: date
    total_flagged_amount: float = Field(ge=0)
    country: str
    status: AlertStatus
    latest_alert_id: str


class SuspiciousAccounts(BaseModel):
    items: list[SuspiciousAccount]
    total: int = Field(ge=0)


AccountSort = Literal["max_score_desc", "latest_score_desc", "last_week_desc"]


class AccountAlerts(BaseModel):
    items: list[Alert]
