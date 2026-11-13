"""Tradução entre o banco e o contrato do front, compartilhada pelas rotas de alertas."""

from datetime import date, timedelta
from typing import Annotated

from fastapi import Path, status
from sqlalchemy import Connection, RowMapping, text

from api.errors import AppError
from api.schemas.alerts import Alert, AlertStatus, DecisionType

# Banco -> front. O front não distingue "new" de "in_review": os dois são pendentes.
STATUS_TO_FRONT: dict[str, AlertStatus] = {
    "new": "pending",
    "in_review": "pending",
    "escalated": "escalated",
    "archived": "archived",
    "reported": "reported",
}
# Front -> banco, para filtrar a fila.
STATUS_FROM_FRONT: dict[AlertStatus, tuple[str, ...]] = {
    "pending": ("new", "in_review"),
    "escalated": ("escalated",),
    "archived": ("archived",),
    "reported": ("reported",),
}
# Decisão do analista -> status do alerta no banco.
DECISION_STATUS: dict[DecisionType, str] = {
    "archive": "archived",
    "escalate": "escalated",
    "report": "reported",
}

UNDEFINED_TYPOLOGY = "Indefinida"
UNDEFINED_COUNTRY = "Indefinido"

AlertId = Annotated[int, Path(ge=1, le=2**63 - 1, description="id numérico do alerta")]

# Colunas que alert_from_row espera, com a tabela alerts apelidada de `a`.
ALERT_COLUMNS = (
    "a.id, a.account, a.week, a.score, a.status, a.countries, a.typology,"
    " a.total_amount, a.transaction_count, a.queue_position, a.origin"
)
# Alerta de verdade: a conta que passou do corte da fila. A amostra de controle
# (origin = 'exploration') aparece na fila da semana, mas fica fora de toda contagem de alertas e
# da lista de contas suspeitas. Trecho fixo de SQL, com a tabela alerts apelidada de `a`.
MODEL_ALERTS = "a.origin = 'model'"


def week_start(day: date) -> date:
    """Semana é sempre identificada pela segunda-feira."""
    return day - timedelta(days=day.weekday())


def alert_from_row(row: RowMapping) -> Alert:
    """Linha com ALERT_COLUMNS -> contrato do front (score de 0-1 para 0-100)."""
    return Alert(
        id=str(row["id"]),
        account=str(row["account"]),
        week=row["week"],
        country=row["countries"][0] if row["countries"] else UNDEFINED_COUNTRY,
        typology=row["typology"] or UNDEFINED_TYPOLOGY,
        score=round(float(row["score"]) * 100, 1),
        amount=float(row["total_amount"]),
        transaction_count=row["transaction_count"],
        status=STATUS_TO_FRONT[row["status"]],
        queue_position=row["queue_position"],
        origin=row["origin"],
    )


def get_alert_row(conn: Connection, alert_id: int, *, for_update: bool = False) -> RowMapping:
    """Linha do alerta com ALERT_COLUMNS, ou 404.

    `for_update` trava a linha (FOR UPDATE) até o fim da transação da requisição.
    """
    sql = f"SELECT {ALERT_COLUMNS} FROM alerts a WHERE a.id = :id"
    if for_update:
        sql += " FOR UPDATE"
    row = conn.execute(text(sql), {"id": alert_id}).mappings().first()
    if row is None:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "alert.not_found",
            f"Alerta {alert_id} não encontrado.",
            {"id": alert_id},
        )
    return row
