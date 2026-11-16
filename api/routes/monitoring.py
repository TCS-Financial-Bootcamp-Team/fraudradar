"""Monitoramento da fila e do modelo numa semana (dashboard e tela de monitoramento)."""

from datetime import date

from fastapi import APIRouter

from api.dependencies import DbConnection
from api.domain import week_start
from api.repositories import monitoring as repo
from api.schemas.monitoring import Indicators, Monitoring, Series, StatusCounts, WeekSeries

router = APIRouter(tags=["monitoring"])


def _rate_series(mapping: object) -> list[Series]:
    """{"UK": 0.01, ...} do worker -> séries da maior para a menor; ignora o que não é número."""
    if not isinstance(mapping, dict):
        return []
    series = [
        Series(name=str(name), value=clamped)
        for name, value in mapping.items()
        if (clamped := repo.clamp_rate(value)) is not None
    ]
    return sorted(series, key=lambda s: (-s.value, s.name))


@router.get("/monitoring", response_model=Monitoring)
def get_monitoring(week: date, conn: DbConnection) -> Monitoring:
    week = week_start(week)
    counts = repo.week_counts(conn, week)
    batch = repo.get_batch(conn, week)
    metrics = batch["metrics"] if batch else {}
    active_accounts = batch["active_accounts"] if batch else 0
    alert_rate = counts["alerts"] / active_accounts if active_accounts else 0.0
    return Monitoring(
        week=week,
        indicators=Indicators(
            alerts=counts["alerts"],
            reviewed=counts["reviewed"],
            reported=counts["reported"],
            alert_rate=repo.clamp_rate(alert_rate) or 0.0,
            flagged_amount=float(counts["flagged_amount"]),
        ),
        weeks=[
            WeekSeries(name=repo.week_label(row["week"]), value=row["alerts"], week=row["week"])
            for row in repo.alerts_by_week(conn, week)
        ],
        typologies=[Series(**row) for row in repo.distribution(conn, week, "typology")],
        countries=[Series(**row) for row in repo.distribution(conn, week, "country")],
        country_rates=_rate_series(metrics.get("country_rates")),
        payment_type_rates=_rate_series(metrics.get("payment_type_rates")),
        score_histogram=[Series(**item) for item in repo.score_histogram(conn, week)],
        status_counts=StatusCounts(**repo.status_counts(conn, week)),
    )
