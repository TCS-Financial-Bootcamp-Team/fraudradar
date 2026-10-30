"""Decisões e comunicações na transação da requisição."""

import json
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import Connection, RowMapping, text

from api.dependencies import User
from api.domain import DECISION_STATUS, alert_from_row, get_alert_row, week_start
from api.schemas.alerts import Alert, ApprovalRequest, DecisionRequest, Report


def build_report_draft(alert: RowMapping, justification: str, assessment: str | None) -> str:
    """Texto acadêmico determinístico; reserva espaço para o encerramento."""
    start = week_start(alert["week"])
    end = start + timedelta(days=6)
    amount = f"{alert['total_amount']:,.2f}".translate(str.maketrans({",": ".", ".": ","}))
    body = (
        "COMUNICAÇÃO DE OPERAÇÃO SUSPEITA — SIMULAÇÃO ACADÊMICA\n\n"
        f"Conta: {alert['account']}\n"
        f"Semana: {start:%d/%m/%Y} a {end:%d/%m/%Y}\n"
        f"Score: {float(alert['score']) * 100:.1f}%\n"
        f"Tipologia prevista: {alert['typology'] or 'Indefinida'}\n"
        f"Valor total: £ {amount}\n"
        f"Quantidade de transações: {alert['transaction_count']}\n"
        f"Países: {', '.join(alert['countries']) or 'Indefinidos'}\n\n"
        f"Justificativa do analista: {justification}\n"
    )
    footer = "\nRascunho gerado pelo FraudRadar PLD. Deve ser revisado antes da aprovação."
    limit = 20000 - len(footer)
    body = body[:limit]
    if assessment:
        body += f"\nParecer mais recente:\n{assessment}"[: limit - len(body)]
    return body + footer


def _ensure_open(conn: Connection, alert_id: int) -> None:
    approved = conn.execute(
        text("SELECT id FROM reports WHERE alert_id = :id AND status = 'approved' LIMIT 1"),
        {"id": alert_id},
    ).scalar_one_or_none()
    if approved is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A comunicação deste alerta já foi aprovada.")


def _latest_report(conn: Connection, alert_id: int) -> RowMapping:
    row = (
        conn.execute(
            text(
                "SELECT * FROM reports WHERE alert_id = :id"
                " ORDER BY created_at DESC, id DESC LIMIT 1"
            ),
            {"id": alert_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Este alerta não tem comunicação.")
    return row


def _report_from_row(row: RowMapping) -> Report:
    return Report(
        alert_id=str(row["alert_id"]),
        content=row["draft"],
        status=row["status"],
        updated_at=row["approved_at"] or row["created_at"],
    )


def _audit(conn: Connection, alert_id: int, user: User, action: str, details: dict) -> None:
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
            " VALUES (:actor, :action, 'alert', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "action": action,
            "id": str(alert_id),
            "details": json.dumps({**details, "user_id": user.id}),
        },
    )


def record_decision(conn: Connection, alert_id: int, request: DecisionRequest, user: User) -> Alert:
    alert = get_alert_row(conn, alert_id, for_update=True)
    _ensure_open(conn, alert_id)
    assessment = (
        conn.execute(
            text(
                "SELECT id, content FROM assessments WHERE alert_id = :id"
                " ORDER BY created_at DESC, id DESC LIMIT 1"
            ),
            {"id": alert_id},
        )
        .mappings()
        .first()
    )
    decision_id = conn.execute(
        text(
            "INSERT INTO decisions (alert_id, assessment_id, analyst, decision, justification)"
            " VALUES (:id, :assessment, :analyst, :decision, :justification) RETURNING id"
        ),
        {
            "id": alert_id,
            "assessment": assessment["id"] if assessment is not None else None,
            "analyst": user.name,
            "decision": request.decision,
            "justification": request.justification,
        },
    ).scalar_one()
    conn.execute(
        text("UPDATE alerts SET status = :status, updated_at = now() WHERE id = :id"),
        {"status": DECISION_STATUS[request.decision], "id": alert_id},
    )
    if request.decision == "report":
        draft = build_report_draft(
            alert,
            request.justification,
            assessment["content"] if assessment is not None else None,
        )
        # Um rascunho antigo é refeito com a justificativa e o parecer vigentes: o texto editado
        # pelo analista só chega no ato da aprovação, então nada salvo se perde.
        draft_id = conn.execute(
            text(
                "UPDATE reports SET decision_id = :decision, draft = :draft,"
                " created_at = now() WHERE alert_id = :id AND status = 'draft' RETURNING id"
            ),
            {"decision": decision_id, "draft": draft, "id": alert_id},
        ).scalar_one_or_none()
        if draft_id is None:
            conn.execute(
                text(
                    "INSERT INTO reports (alert_id, decision_id, draft, status)"
                    " VALUES (:id, :decision, :draft, 'draft')"
                ),
                {"id": alert_id, "decision": decision_id, "draft": draft},
            )
    _audit(
        conn,
        alert_id,
        user,
        "decision",
        {"decision": request.decision, "decision_id": decision_id},
    )
    return alert_from_row(get_alert_row(conn, alert_id))


def get_report(conn: Connection, alert_id: int) -> Report:
    get_alert_row(conn, alert_id)
    return _report_from_row(_latest_report(conn, alert_id))


def approve_report(conn: Connection, alert_id: int, request: ApprovalRequest, user: User) -> Report:
    alert = get_alert_row(conn, alert_id, for_update=True)
    report = _latest_report(conn, alert_id)
    _ensure_open(conn, alert_id)
    if alert["status"] != "reported":
        raise HTTPException(status.HTTP_409_CONFLICT, "A decisão atual do alerta não é comunicar.")
    row = (
        conn.execute(
            text(
                "UPDATE reports SET draft = :content, status = 'approved',"
                " approved_by = :analyst, approved_at = now() WHERE id = :id RETURNING *"
            ),
            {"content": request.content, "analyst": user.name, "id": report["id"]},
        )
        .mappings()
        .one()
    )
    _audit(conn, alert_id, user, "report_approved", {"report_id": row["id"]})
    return _report_from_row(row)
