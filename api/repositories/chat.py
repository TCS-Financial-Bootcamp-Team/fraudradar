"""Consultas SQL do histórico de conversas e ferramentas somente leitura do agente."""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import date
from typing import Any, Literal

from fastapi import status
from sqlalchemy import Connection, text

from api.alert_ai_service import prepare_alert_ai
from api.domain import (
    MODEL_ALERTS,
    STATUS_FROM_FRONT,
    STATUS_TO_FRONT,
    UNDEFINED_COUNTRY,
    UNDEFINED_TYPOLOGY,
    get_alert_row,
    week_start,
)
from api.errors import AppError
from api.repositories import monitoring, weeks
from api.schemas.alerts import AlertOrigin, AlertStatus, DecisionType, Source
from api.schemas.chat import (
    ChatLink,
    ChatResponse,
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
)
from fraudradar.ai.alert_assessment import TYPOLOGY_LABELS
from fraudradar.ai.app_guide import validate_links

MAX_STORED_MESSAGE_CHARS = 16_000
MAX_TITLE_CHARS = 80

_SEARCH_ORDER_SQL: dict[Literal["score", "queue_position", "week"], str] = {
    "score": "a.score DESC, a.queue_position ASC, a.id ASC",
    "queue_position": "a.queue_position ASC, a.week DESC, a.id ASC",
    "week": "a.week DESC, a.score DESC, a.queue_position ASC, a.id ASC",
}

_TYPOLOGY_BY_CODE = {code.casefold(): label for code, label in TYPOLOGY_LABELS.items()}


def conversation_title(message: str) -> str:
    """Normaliza espaços e limita o título da conversa a 80 caracteres."""
    collapsed = " ".join(message.split())
    return collapsed[:MAX_TITLE_CHARS].rstrip() or "Conversa"


def load_conversation_history(
    conn: Connection,
    *,
    conversation_id: int,
    owner_id: str,
    dataset: str,
) -> list[dict[str, str]]:
    """Confere posse e conjunto da conversa e devolve as últimas 6 mensagens em ordem."""
    exists = conn.execute(
        text(
            "SELECT id FROM public.chat_conversations"
            " WHERE id = :id AND owner_id = :owner_id AND dataset = :dataset"
        ),
        {"id": conversation_id, "owner_id": owner_id, "dataset": dataset},
    ).scalar()
    if exists is None:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "chat.conversation_not_found",
            "Conversa não encontrada.",
        )

    rows = (
        conn.execute(
            text(
                "SELECT role, content FROM public.chat_messages"
                " WHERE conversation_id = :id ORDER BY id DESC LIMIT 6"
            ),
            {"id": conversation_id},
        )
        .mappings()
        .all()
    )
    return [{"role": str(row["role"]), "content": str(row["content"])} for row in reversed(rows)]


def save_conversation_turn(
    conn: Connection,
    *,
    conversation_id: int | None,
    owner_id: str,
    dataset: str,
    user_message: str,
    response: ChatResponse,
) -> int:
    """Cria ou atualiza a conversa e grava pergunta e resposta na mesma transação curta."""
    if conversation_id is None:
        conv_id = conn.execute(
            text(
                "INSERT INTO public.chat_conversations (dataset, owner_id, title)"
                " VALUES (:dataset, :owner_id, :title) RETURNING id"
            ),
            {
                "dataset": dataset,
                "owner_id": owner_id,
                "title": conversation_title(user_message),
            },
        ).scalar_one()
    else:
        conv_id = conn.execute(
            text(
                "UPDATE public.chat_conversations SET updated_at = now()"
                " WHERE id = :id AND owner_id = :owner_id AND dataset = :dataset"
                " RETURNING id"
            ),
            {"id": conversation_id, "owner_id": owner_id, "dataset": dataset},
        ).scalar()
        if conv_id is None:
            raise AppError(
                status.HTTP_404_NOT_FOUND,
                "chat.conversation_not_found",
                "Conversa não encontrada.",
            )

    sources_json = json.dumps([item.model_dump() for item in response.sources], ensure_ascii=False)
    links_json = json.dumps([item.model_dump() for item in response.links], ensure_ascii=False)
    conn.execute(
        text(
            "INSERT INTO public.chat_messages"
            " (conversation_id, role, content, kind, sources, links, model)"
            " VALUES"
            " (:cid, 'user', :user_content, NULL, '[]'::jsonb, '[]'::jsonb, NULL),"
            " (:cid, 'assistant', :assistant_content, :kind,"
            "  CAST(:sources AS jsonb), CAST(:links AS jsonb), :model)"
        ),
        {
            "cid": conv_id,
            "user_content": user_message[:MAX_STORED_MESSAGE_CHARS],
            "assistant_content": response.answer[:MAX_STORED_MESSAGE_CHARS],
            "kind": response.kind,
            "sources": sources_json,
            "links": links_json,
            "model": response.model,
        },
    )
    return int(conv_id)


def list_conversations(
    conn: Connection,
    *,
    owner_id: str,
    dataset: str,
    limit: int = 30,
) -> list[ConversationSummary]:
    """Lista conversas do usuário autenticado no conjunto atual, da mais recente à mais antiga."""
    rows = (
        conn.execute(
            text(
                "SELECT c.id, c.title, c.updated_at, count(m.id) AS message_count"
                " FROM public.chat_conversations c"
                " LEFT JOIN public.chat_messages m ON m.conversation_id = c.id"
                " WHERE c.owner_id = :owner_id AND c.dataset = :dataset"
                " GROUP BY c.id"
                " ORDER BY c.updated_at DESC, c.id DESC"
                " LIMIT :limit"
            ),
            {"owner_id": owner_id, "dataset": dataset, "limit": limit},
        )
        .mappings()
        .all()
    )
    return [
        ConversationSummary(
            id=int(row["id"]),
            title=str(row["title"]),
            updated_at=row["updated_at"],
            message_count=int(row["message_count"]),
        )
        for row in rows
    ]


def get_conversation_detail(
    conn: Connection,
    *,
    conversation_id: int,
    owner_id: str,
    dataset: str,
) -> ConversationDetail:
    """Retorna uma conversa com suas mensagens em ordem cronológica."""
    conv = (
        conn.execute(
            text(
                "SELECT id, title, updated_at FROM public.chat_conversations"
                " WHERE id = :id AND owner_id = :owner_id AND dataset = :dataset"
            ),
            {"id": conversation_id, "owner_id": owner_id, "dataset": dataset},
        )
        .mappings()
        .first()
    )
    if conv is None:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "chat.conversation_not_found",
            "Conversa não encontrada.",
        )

    rows = (
        conn.execute(
            text(
                "SELECT role, content, kind, sources, links, model, created_at"
                " FROM public.chat_messages"
                " WHERE conversation_id = :id ORDER BY id ASC"
            ),
            {"id": conversation_id},
        )
        .mappings()
        .all()
    )
    messages: list[ConversationMessage] = []
    for row in rows:
        raw_sources = row["sources"] if isinstance(row["sources"], list) else []
        sources = [
            Source(title=s["title"], excerpt=s["excerpt"])
            for s in raw_sources
            if isinstance(s, dict)
            and isinstance(s.get("title"), str)
            and isinstance(s.get("excerpt"), str)
        ]
        raw_links = row["links"] if isinstance(row["links"], list) else []
        links = [ChatLink(**item) for item in validate_links(raw_links)]
        grounded = (len(sources) > 0) if row["kind"] == "legal" else None
        messages.append(
            ConversationMessage(
                role=row["role"],
                content=str(row["content"]),
                kind=row["kind"],
                sources=sources,
                links=links,
                model=row["model"],
                created_at=row["created_at"],
                grounded=grounded,
            )
        )

    return ConversationDetail(
        id=int(conv["id"]),
        title=str(conv["title"]),
        updated_at=conv["updated_at"],
        messages=messages,
    )


def delete_conversation(
    conn: Connection,
    *,
    conversation_id: int,
    owner_id: str,
    dataset: str,
) -> None:
    """Remove a conversa do usuário no conjunto atual ou responde 404."""
    deleted = conn.execute(
        text(
            "DELETE FROM public.chat_conversations"
            " WHERE id = :id AND owner_id = :owner_id AND dataset = :dataset"
            " RETURNING id"
        ),
        {"id": conversation_id, "owner_id": owner_id, "dataset": dataset},
    ).scalar()
    if deleted is None:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "chat.conversation_not_found",
            "Conversa não encontrada.",
        )


# --- ferramentas somente leitura do agente (nunca leem gabarito nem retornam contas) ---


def _parse_week(week_str: str) -> date | None:
    try:
        return week_start(date.fromisoformat(week_str))
    except ValueError:
        return None


def search_alerts_for_agent(
    conn: Connection,
    *,
    week: str | None = None,
    status_filter: AlertStatus | None = None,
    decision: DecisionType | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    typology: str | None = None,
    origin: AlertOrigin | None = None,
    order_by: Literal["score", "queue_position", "week"] = "score",
    limit: int = 10,
    forbidden_identifiers: set[str] | None = None,
) -> dict[str, Any]:
    """Busca alertas no conjunto atual sem retornar números de conta."""
    filters: list[str] = []
    params: dict[str, Any] = {"limit": min(max(1, limit), 20)}

    if week is not None:
        parsed_week = _parse_week(week)
        if parsed_week is None:
            return {"error": "Data de semana inválida. Use o formato AAAA-MM-DD."}
        filters.append("a.week = :week")
        params["week"] = parsed_week

    if status_filter is not None:
        filters.append("a.status = ANY(CAST(:status AS text[]))")
        params["status"] = list(STATUS_FROM_FRONT[status_filter])

    if decision is not None:
        filters.append("ld.decision = :decision")
        params["decision"] = decision

    if min_score is not None:
        filters.append("a.score >= :min_score")
        params["min_score"] = max(0.0, min(1.0, float(min_score) / 100.0))

    if max_score is not None:
        filters.append("a.score <= :max_score")
        params["max_score"] = max(0.0, min(1.0, float(max_score) / 100.0))

    if typology is not None and typology.strip():
        raw_typology = typology.strip()
        mapped_label = _TYPOLOGY_BY_CODE.get(raw_typology.casefold(), raw_typology)
        filters.append(
            "(lower(COALESCE(a.typology, :undefined)) = lower(:typology_label)"
            " OR lower(COALESCE(a.typology, :undefined)) = lower(:typology_raw))"
        )
        params["undefined"] = UNDEFINED_TYPOLOGY
        params["typology_label"] = mapped_label
        params["typology_raw"] = raw_typology

    if origin is not None:
        filters.append("a.origin = :origin")
        params["origin"] = origin

    where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
    order_sql = _SEARCH_ORDER_SQL.get(order_by, _SEARCH_ORDER_SQL["score"])

    rows = (
        conn.execute(
            text(
                f"""
                SELECT a.id, a.account, a.week, a.score, a.queue_position, a.status,
                       a.countries, a.typology, a.total_amount, a.transaction_count,
                       a.origin, ld.decision
                FROM alerts a
                LEFT JOIN LATERAL (
                    SELECT d.decision
                    FROM decisions d
                    WHERE d.alert_id = a.id
                    ORDER BY d.decided_at DESC, d.id DESC
                    LIMIT 1
                ) ld ON true
                {where_sql}
                ORDER BY {order_sql}
                LIMIT :limit
                """
            ),
            params,
        )
        .mappings()
        .all()
    )

    alerts = []
    for row in rows:
        if forbidden_identifiers is not None:
            forbidden_identifiers.add(str(row["account"]))
        alerts.append(
            {
                "alert_id": int(row["id"]),
                "week": row["week"].isoformat(),
                "score": round(float(row["score"]) * 100, 1),
                "queue_position": int(row["queue_position"]),
                "status": STATUS_TO_FRONT[row["status"]],
                "decision_type": row["decision"],
                "typology": row["typology"] or UNDEFINED_TYPOLOGY,
                "origin": row["origin"],
                "country": row["countries"][0] if row["countries"] else UNDEFINED_COUNTRY,
                "total_amount_gbp": round(float(row["total_amount"]), 2),
                "transaction_count": int(row["transaction_count"]),
            }
        )

    return {"alerts": alerts, "count": len(alerts)}


def get_alert_summary_for_agent(
    conn: Connection,
    alert_id: int,
    *,
    forbidden_identifiers: set[str] | None = None,
) -> dict[str, Any]:
    """Reaproveita o construtor de contexto protegido para resumir um alerta sem contas."""
    try:
        row = get_alert_row(conn, alert_id)
    except AppError:
        return {"error": f"Alerta {alert_id} não encontrado no conjunto atual."}

    prepared = prepare_alert_ai(conn, alert_id)
    if forbidden_identifiers is not None:
        forbidden_identifiers.update(prepared.forbidden_identifiers)

    latest_decision = conn.execute(
        text(
            "SELECT decision FROM decisions WHERE alert_id = :id"
            " ORDER BY decided_at DESC, id DESC LIMIT 1"
        ),
        {"id": alert_id},
    ).scalar()

    summary = {key: value for key, value in prepared.context.items() if key != "limitations"}
    summary["alert_id"] = int(row["id"])
    summary["status"] = STATUS_TO_FRONT[row["status"]]
    summary["decision_type"] = latest_decision
    summary["typology"] = row["typology"] or UNDEFINED_TYPOLOGY
    return summary


def list_weeks_for_agent(conn: Connection, *, dataset_slug: str) -> dict[str, Any]:
    """Lista semanas processadas com contagens e estado do último trabalho de processamento."""
    rows = weeks.processed_weeks(conn)
    batches = {
        row["week"]: row["processed_at"]
        for row in conn.execute(text("SELECT week, processed_at FROM weekly_batches")).mappings()
    }
    latest_job = (
        conn.execute(
            text(
                "SELECT status, progress, created_at, finished_at FROM public.jobs"
                " WHERE dataset = :dataset AND kind = 'process'"
                " ORDER BY created_at DESC, id DESC LIMIT 1"
            ),
            {"dataset": dataset_slug},
        )
        .mappings()
        .first()
    )
    items = [
        {
            "week": row["week"].isoformat(),
            "alerts": int(row["alerts"]),
            "pending": int(row["pending"]),
            "processing_status": "processed",
            "processed_at": (batches[row["week"]].isoformat() if row["week"] in batches else None),
        }
        for row in rows
    ]
    return {
        "weeks": items,
        "count": len(items),
        "latest_process_job": (
            {
                "status": latest_job["status"],
                "progress": int(latest_job["progress"]),
                "created_at": latest_job["created_at"].isoformat(),
                "finished_at": (
                    latest_job["finished_at"].isoformat() if latest_job["finished_at"] else None
                ),
            }
            if latest_job
            else None
        ),
    }


def get_week_summary_for_agent(conn: Connection, *, week_str: str) -> dict[str, Any]:
    """Reaproveita os repositórios de monitoramento para resumir uma semana."""
    parsed_week = _parse_week(week_str)
    if parsed_week is None:
        return {"error": "Data de semana inválida. Use o formato AAAA-MM-DD."}

    batch = monitoring.get_batch(conn, parsed_week)
    counts = monitoring.week_counts(conn, parsed_week)
    statuses = monitoring.status_counts(conn, parsed_week)

    stats = (
        conn.execute(
            text(
                f"""
                SELECT avg(a.score) AS mean_score,
                       count(*) FILTER (WHERE ld.decision = 'archive') AS archived_decisions,
                       count(*) FILTER (WHERE ld.decision = 'escalate') AS escalated_decisions,
                       count(*) FILTER (WHERE ld.decision = 'report') AS reported_decisions,
                       count(*) FILTER (WHERE ld.decision IS NULL) AS undecided
                FROM alerts a
                LEFT JOIN LATERAL (
                    SELECT d.decision
                    FROM decisions d
                    WHERE d.alert_id = a.id
                    ORDER BY d.decided_at DESC, d.id DESC
                    LIMIT 1
                ) ld ON true
                WHERE a.week = :week AND {MODEL_ALERTS}
                """
            ),
            {"week": parsed_week},
        )
        .mappings()
        .one()
    )

    mean_score = (
        round(float(stats["mean_score"]) * 100, 1) if stats["mean_score"] is not None else None
    )
    return {
        "week": parsed_week.isoformat(),
        "processed": batch is not None,
        "queue_size": int(counts["alerts"]),
        "reviewed": int(counts["reviewed"]),
        "reported": int(counts["reported"]),
        "flagged_amount_gbp": round(float(counts["flagged_amount"]), 2),
        "mean_score": mean_score,
        "status_counts": {
            "pending": int(statuses["pending"]),
            "escalated": int(statuses["escalated"]),
            "archived": int(statuses["archived"]),
            "reported": int(statuses["reported"]),
        },
        "decision_counts": {
            "archive": int(stats["archived_decisions"]),
            "escalate": int(stats["escalated_decisions"]),
            "report": int(stats["reported_decisions"]),
            "undecided": int(stats["undecided"]),
        },
    }


def get_visible_alerts_for_agent(
    conn: Connection,
    *,
    alert_ids: Sequence[int],
    forbidden_identifiers: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Recarrega pelo banco os alertas visíveis na tela (escopo do conjunto, sem contas)."""
    unique_ids: list[int] = []
    seen: set[int] = set()
    for raw_id in alert_ids:
        if isinstance(raw_id, bool) or not isinstance(raw_id, int) or raw_id < 1:
            continue
        if raw_id not in seen:
            seen.add(raw_id)
            unique_ids.append(raw_id)
        if len(unique_ids) >= 100:
            break

    if not unique_ids:
        return []

    rows = (
        conn.execute(
            text(
                """
                SELECT a.id, a.account, a.week, a.score, a.queue_position, a.status,
                       a.typology, a.origin, a.total_amount, a.transaction_count,
                       ld.decision
                FROM alerts a
                LEFT JOIN LATERAL (
                    SELECT d.decision
                    FROM decisions d
                    WHERE d.alert_id = a.id
                    ORDER BY d.decided_at DESC, d.id DESC
                    LIMIT 1
                ) ld ON true
                WHERE a.id = ANY(CAST(:ids AS bigint[]))
                """
            ),
            {"ids": unique_ids},
        )
        .mappings()
        .all()
    )

    by_id: dict[int, dict[str, Any]] = {}
    for row in rows:
        if forbidden_identifiers is not None:
            forbidden_identifiers.add(str(row["account"]))
        alert_id = int(row["id"])
        by_id[alert_id] = {
            "alert_id": alert_id,
            "week": row["week"].isoformat(),
            "score": round(float(row["score"]) * 100, 1),
            "queue_position": int(row["queue_position"]),
            "status": STATUS_TO_FRONT[row["status"]],
            "decision_type": row["decision"],
            "typology": row["typology"] or UNDEFINED_TYPOLOGY,
            "origin": row["origin"],
            "total_amount_gbp": round(float(row["total_amount"]), 2),
            "transaction_count": int(row["transaction_count"]),
        }

    # Mantém a ordem da tela e descarta IDs inexistentes ou de outro conjunto.
    return [by_id[aid] for aid in unique_ids if aid in by_id]
