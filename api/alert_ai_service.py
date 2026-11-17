"""Lê os fatos do alerta e os converte em valores destacados da transação."""

from sqlalchemy import Connection

from api.domain import alert_from_row, get_alert_row
from api.repositories import alert_queue
from api.repositories.alert_ai_context import read_alert_ai_facts
from fraudradar.ai.alert_assessment import PreparedAlertAI, build_alert_context

__all__ = ["PreparedAlertAI", "prepare_alert_ai"]


def prepare_alert_ai(conn: Connection, alert_id: int) -> PreparedAlertAI:
    """Busca evidências financeiras e monta um contexto protegido em memória."""
    row = get_alert_row(conn, alert_id)
    alert = alert_from_row(row)
    rules = alert_queue.alert_rules(conn, alert_id)
    movements = alert_queue.account_movements(conn, int(row["account"]), row["week"])
    facts = read_alert_ai_facts(conn, alert_id, int(row["account"]), row["week"])
    return build_alert_context(
        alert.model_dump(mode="json"),
        [],
        [item.model_dump(mode="json") for item in rules],
        [item.model_dump(mode="json") for item in movements],
        **facts,
    )
