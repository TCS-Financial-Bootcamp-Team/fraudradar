"""Fila de alertas da semana, detalhe com evidências e grafo de 2 saltos.

- GET /alerts?week=&status=&country=&search=&page=&size=&sort=  — fila paginada da semana
- GET /alerts/{id}                                             — detalhe + evidências
- GET /alerts/{id}/graph                                       — grafo de 2 saltos (Cytoscape)

Decisão e comunicação ficam em decisions.py; parecer e chat em ai.py.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from api.dependencies import DbConnection
from api.domain import AlertId, alert_from_row, get_alert_row, week_start
from api.repositories import alert_queue
from api.schemas.alerts import AlertDetail, AlertQueue, AlertStatus, Graph

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=AlertQueue)
def list_alerts(
    conn: DbConnection,
    week: date,
    status: AlertStatus | None = None,
    country: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    search: Annotated[str | None, Query(min_length=1, max_length=40)] = None,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,  # sem teto, OFFSET estoura o bigint
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    sort: alert_queue.SortOrder = "score_desc",
) -> AlertQueue:
    """Fila paginada da semana.

    `search` filtra por id exato ou prefixo de conta;
    `countries` traz todas as opções da semana, sem os filtros.
    """
    week = week_start(week)
    rows, total = alert_queue.list_queue(
        conn,
        week,
        status=status,
        country=country,
        search=search,
        page=page,
        size=size,
        sort=sort,
    )
    return AlertQueue(
        items=[alert_from_row(row) for row in rows],
        total=total,
        countries=alert_queue.week_countries(conn, week),
    )


@router.get("/{alert_id}", response_model=AlertDetail)
def get_alert_detail(alert_id: AlertId, conn: DbConnection) -> AlertDetail:
    """Alerta com evidências: contribuições, regras, movimentações e último parecer."""
    row = get_alert_row(conn, alert_id)
    return AlertDetail(
        **alert_from_row(row).model_dump(),
        contributions=alert_queue.alert_contributions(conn, alert_id),
        rules=alert_queue.alert_rules(conn, alert_id),
        movements=alert_queue.account_movements(conn, row["account"], row["week"]),
        assessment=alert_queue.latest_assessment(conn, alert_id),
    )


@router.get("/{alert_id}/graph", response_model=Graph)
def get_alert_graph(alert_id: AlertId, conn: DbConnection) -> Graph:
    """Vizinhança de até 2 saltos da conta na semana do alerta."""
    row = get_alert_row(conn, alert_id)
    nodes, edges = alert_queue.two_hop_graph(conn, row["account"], row["week"])
    return Graph(nodes=nodes, edges=edges)
