"""Contas suspeitas consolidadas e histórico semanal da conta."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path, Query

from api.dependencies import DbConnection
from api.repositories import accounts as repository
from api.schemas.accounts import AccountAlerts, AccountSort, SuspiciousAccounts
from api.schemas.alerts import AlertStatus

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("/suspicious", response_model=SuspiciousAccounts)
def list_suspicious_accounts(
    conn: DbConnection,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    status: AlertStatus | None = None,
    search: Annotated[str | None, Query(max_length=64)] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    sort: AccountSort = "max_score_desc",
) -> SuspiciousAccounts:
    items, total = repository.list_suspicious_accounts(
        conn,
        start=start,
        end=end,
        status=status,
        search=search,
        page=page,
        size=size,
        sort=sort,
    )
    return SuspiciousAccounts(items=items, total=total)


@router.get("/{account}/alerts", response_model=AccountAlerts)
def list_account_alerts(
    account: Annotated[int, Path(ge=0, le=2**63 - 1)], conn: DbConnection
) -> AccountAlerts:
    return AccountAlerts(items=repository.account_alerts(conn, account))
