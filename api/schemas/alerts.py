"""Contrato de alertas com o front: espelha web/src/features/alerts/schemas/alerts.ts.

Mudou aqui, mude lá (e vice-versa). Ids e contas saem como texto; score sai de 0 a 100.
"""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

AlertStatus = Literal["pending", "escalated", "archived", "reported"]
DecisionType = Literal["archive", "escalate", "report"]


class Alert(BaseModel):
    id: str
    account: str
    week: date
    country: str
    typology: str
    score: float = Field(ge=0, le=100)
    amount: float = Field(ge=0)
    transaction_count: int = Field(ge=0)
    status: AlertStatus
    queue_position: int = Field(ge=1, description="posição na fila da semana (1 = mais suspeita)")


class AlertQueue(BaseModel):
    items: list[Alert]
    total: int = Field(ge=0)
    countries: list[str]


class Source(BaseModel):
    title: str
    excerpt: str


class Assessment(BaseModel):
    content: str
    sources: list[Source]


class Contribution(BaseModel):
    name: str
    value: float = Field(ge=0, le=100)


class Rule(BaseModel):
    code: str
    description: str


class Movement(BaseModel):
    id: str
    date: str
    sender: str
    receiver: str
    amount: float
    currency: (
        str  # código ISO da moeda de `amount` (o front formata com Intl): sempre GBP no SAML-D
    )
    payment_type: str
    payment_currency: str  # rótulo do SAML-D ("Naira"); a mais no contrato, o zod do front descarta


class AlertDetail(Alert):
    contributions: list[Contribution]
    rules: list[Rule]
    movements: list[Movement]
    assessment: Assessment | None


class Node(BaseModel):
    id: str
    label: str
    central: bool


class Edge(BaseModel):
    id: str
    source: str
    target: str
    amount: float


class Graph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class DecisionRequest(BaseModel):
    decision: DecisionType
    justification: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=4000)
    ]


class Report(BaseModel):
    alert_id: str
    content: str
    status: Literal["draft", "approved"]
    updated_at: datetime


class ApprovalRequest(BaseModel):
    content: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=30, max_length=20000)
    ]
