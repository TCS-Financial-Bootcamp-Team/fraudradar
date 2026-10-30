"""Decisão do analista sobre o alerta e comunicação ao COAF.

- POST /alerts/{id}/decision        — arquivar/aprofundar/comunicar + justificativa
- GET  /alerts/{id}/report          — rascunho (ou versão aprovada) da comunicação
- POST /alerts/{id}/report/approve  — aprova o rascunho com o nome do analista
"""

from fastapi import APIRouter

from api.dependencies import CurrentUser, DbConnection
from api.domain import AlertId
from api.repositories import decisions
from api.schemas.alerts import Alert, ApprovalRequest, DecisionRequest, Report

router = APIRouter(prefix="/alerts", tags=["decisions"])


@router.post("/{alert_id}/decision", response_model=Alert)
def record_decision(
    alert_id: AlertId, request: DecisionRequest, conn: DbConnection, user: CurrentUser
) -> Alert:
    return decisions.record_decision(conn, alert_id, request, user)


@router.get("/{alert_id}/report", response_model=Report)
def get_report(alert_id: AlertId, conn: DbConnection) -> Report:
    return decisions.get_report(conn, alert_id)


@router.post("/{alert_id}/report/approve", response_model=Report)
def approve_report(
    alert_id: AlertId, request: ApprovalRequest, conn: DbConnection, user: CurrentUser
) -> Report:
    return decisions.approve_report(conn, alert_id, request, user)
