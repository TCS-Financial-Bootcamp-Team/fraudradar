"""Escrita compartilhada do registro de auditoria."""

import json

from sqlalchemy import Connection, text

from api.dependencies import User


def write_audit_log(
    conn: Connection,
    *,
    alert_id: int,
    user: User,
    action: str,
    details: dict,
) -> None:
    """Registra uma ação sobre alerta na transação recebida."""
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
