"""Semanas processadas pelo worker (`lotes_semana`) e o replay que as libera uma a uma."""

import json
from datetime import date

from sqlalchemy import Connection, RowMapping, text

from api.dependencias import Usuario
from api.dominio import STATUS_DO_FRONT


def semanas_liberadas(conn: Connection) -> list[RowMapping]:
    sql = """
        SELECT l.semana,
               count(a.id) AS alertas,
               count(a.id) FILTER (WHERE a.status = ANY(:pendentes)) AS pendentes
        FROM lotes_semana l
        LEFT JOIN alertas a ON a.semana = l.semana
        WHERE l.liberada_em IS NOT NULL
        GROUP BY l.semana
        ORDER BY l.semana DESC
    """
    pendentes = list(STATUS_DO_FRONT["pendente"])
    return list(conn.execute(text(sql), {"pendentes": pendentes}).mappings())


def liberar_proxima(conn: Connection, usuario: Usuario) -> tuple[date, int] | None:
    """Libera a semana processada mais antiga ainda não exibida. None se não houver."""
    # Dois cliques simultâneos liberam duas semanas em sequência, nunca a mesma duas vezes.
    conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('fraudradar.replay'))"))
    semana = conn.execute(
        text("""
            UPDATE lotes_semana SET liberada_em = now()
            WHERE semana = (SELECT min(semana) FROM lotes_semana WHERE liberada_em IS NULL)
            RETURNING semana
        """)
    ).scalar()
    if semana is None:
        return None
    alertas = conn.execute(
        text("SELECT count(*) FROM alertas WHERE semana = :semana"), {"semana": semana}
    ).scalar_one()
    conn.execute(
        text("""
            INSERT INTO auditoria (quem, acao, entidade, entidade_id, detalhes)
            VALUES (:quem, 'replay', 'semana', :semana, CAST(:detalhes AS jsonb))
        """),
        {
            "quem": usuario.nome,
            "semana": semana.isoformat(),
            "detalhes": json.dumps({"alertas": alertas, "usuario_id": usuario.id}),
        },
    )
    return semana, alertas
