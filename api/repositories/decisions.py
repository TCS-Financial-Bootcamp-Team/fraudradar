"""Decisões e comunicações na transação da requisição."""

from datetime import timedelta

from fastapi import status
from sqlalchemy import Connection, RowMapping, text

from api.dependencies import User
from api.domain import DECISION_STATUS, alert_from_row, get_alert_row, week_start
from api.errors import AppError
from api.repositories.audit import write_audit_log
from api.schemas.alerts import Alert, ApprovalRequest, DecisionRequest, Report
from fraudradar.ai.alert_assessment import assessment_plain_text
from fraudradar.model.feedback import decision_label, store_label


def build_report_draft(alert: RowMapping, justification: str, assessment: str | None) -> str:
    """Texto acadêmico determinístico; reserva espaço para o encerramento."""
    start = week_start(alert["week"])
    end = start + timedelta(days=6)
    amount = f"{alert['total_amount']:,.2f}".translate(str.maketrans({",": ".", ".": ","}))
    # A nota ordena a fila; o modelo não é calibrado, então ela não é chance de ser lavagem.
    score = f"{float(alert['score']) * 100:.1f}".replace(".", ",")
    body = (
        "COMUNICAÇÃO DE OPERAÇÃO SUSPEITA — SIMULAÇÃO ACADÊMICA\n\n"
        f"Conta: {alert['account']}\n"
        f"Semana: {start:%d/%m/%Y} a {end:%d/%m/%Y}\n"
        f"Nota de risco do modelo: {score} de 100 (ordena a fila; não é probabilidade)\n"
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
        plain_assessment = assessment_plain_text(assessment)
        body += f"\nParecer mais recente:\n{plain_assessment}"[: limit - len(body)]
    return body + footer


def _ensure_open(conn: Connection, alert_id: int) -> None:
    approved = conn.execute(
        text("SELECT id FROM reports WHERE alert_id = :id AND status = 'approved' LIMIT 1"),
        {"id": alert_id},
    ).scalar_one_or_none()
    if approved is not None:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "report.already_approved",
            "A comunicação deste alerta já foi aprovada.",
        )


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
        raise AppError(
            status.HTTP_404_NOT_FOUND, "report.not_found", "Este alerta não tem comunicação."
        )
    return row


def _report_from_row(row: RowMapping) -> Report:
    return Report(
        alert_id=str(row["alert_id"]),
        content=row["draft"],
        status=row["status"],
        updated_at=row["approved_at"] or row["created_at"],
    )


def _audit(conn: Connection, alert_id: int, user: User, action: str, details: dict) -> None:
    """Mantém o ponto de extensão dos testes sobre o escritor compartilhado."""
    write_audit_log(
        conn,
        alert_id=alert_id,
        user=user,
        action=action,
        details=details,
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
            "INSERT INTO decisions"
            " (alert_id, assessment_id, analyst, decision, justification, archive_reason)"
            " VALUES (:id, :assessment, :analyst, :decision, :justification, :reason)"
            " RETURNING id"
        ),
        {
            "id": alert_id,
            "assessment": assessment["id"] if assessment is not None else None,
            "analyst": user.name,
            "decision": request.decision,
            "justification": request.justification,
            "reason": request.archive_reason,
        },
    ).scalar_one()
    conn.execute(
        text("UPDATE alerts SET status = :status, updated_at = now() WHERE id = :id"),
        {"status": DECISION_STATUS[request.decision], "id": alert_id},
    )
    # O retorno para o retreino, na mesma transação: vale a última decisão do alerta, então esta
    # troca ou apaga o rótulo que a anterior deixou.
    label = decision_label(request.decision, request.archive_reason)
    store_label(conn, alert_id, decision_id, label)
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
    details = {"decision": request.decision, "decision_id": decision_id}
    if request.archive_reason is not None:
        details["archive_reason"] = request.archive_reason
    _audit(conn, alert_id, user, "decision", details)
    return alert_from_row(get_alert_row(conn, alert_id))


def get_report(conn: Connection, alert_id: int) -> Report:
    get_alert_row(conn, alert_id)
    return _report_from_row(_latest_report(conn, alert_id))


def approve_report(conn: Connection, alert_id: int, request: ApprovalRequest, user: User) -> Report:
    alert = get_alert_row(conn, alert_id, for_update=True)
    report = _latest_report(conn, alert_id)
    _ensure_open(conn, alert_id)
    if alert["status"] != "reported":
        raise AppError(
            status.HTTP_409_CONFLICT,
            "report.not_a_report_decision",
            "A decisão atual do alerta não é comunicar.",
        )
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
