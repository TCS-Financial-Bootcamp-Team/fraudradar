"""Relatório de compatibilidade de uma fonte externa com o formato do SAML-D.

Só **sugere** a relação com o conjunto atual (continua ou é outro dataset); quem decide é a
pessoa que conecta. O relatório é um dicionário JSON (guardado em ``external_connections``):
nada nele carrega senha, e as contas da amostra entram só como contagem e percentual.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal

import psycopg
from psycopg import sql
from sqlalchemy import Connection, text

from fraudradar.data.ingestion import InvalidTransactionsError
from fraudradar.sources import reader
from fraudradar.sources.connection import (
    ExternalSource,
    SourceError,
    open_readonly,
    relation_identifier,
)

SAMPLE_SIZE = 1000
MAX_REPORTED_ERRORS = 5
# Até este intervalo entre o fim dos dados atuais e o começo da fonte ainda é "continua".
CONTINUE_GAP_DAYS = 31
# Com quase todas as contas da amostra já no conjunto e as datas cruzando as dele, a fonte é,
# muito provavelmente, uma cópia do que já está carregado.
SAME_BASE_KNOWN_PCT = 99.0

DatesRelation = Literal["continue", "overlap", "other_era", "empty_dataset", "unknown"]


def monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


@dataclass(frozen=True)
class DatasetRange:
    first: date | None
    last: date | None


def dataset_range(conn: Connection) -> DatasetRange:
    """Primeiro e último dia com transações do conjunto cuja ``search_path`` já está aplicada."""
    first, last = conn.execute(
        text("SELECT min(occurred_at), max(occurred_at) FROM transactions")
    ).one()
    return DatasetRange(first.date() if first else None, last.date() if last else None)


def classify_dates(
    source_first: date | None, source_last: date | None, current: DatasetRange
) -> DatesRelation:
    if source_first is None or source_last is None:
        return "unknown"
    if current.first is None or current.last is None:
        return "empty_dataset"
    if source_first <= current.last and source_last >= current.first:
        return "overlap"
    if source_first > current.last and (source_first - current.last).days <= CONTINUE_GAP_DAYS:
        return "continue"
    return "other_era"


def closed_weeks_conflict(source_first: date | None, current: DatasetRange) -> bool:
    """Verdadeiro se a fonte tem datas em semanas já fechadas do conjunto.

    A semana aberta é a da transação mais recente; tudo antes da segunda-feira dela é fechado.
    """
    if source_first is None or current.last is None:
        return False
    return source_first < monday(current.last)


def _as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


def _lenient_account(value: Any) -> int | None:
    try:
        number = int(str(value).strip().split(".")[0])
    except ValueError:
        return None
    return number if 0 < number < 2**63 else None


def _query_or_none(conn: psycopg.Connection, query: sql.Composed) -> tuple | None:
    """Uma consulta de resumo; estourar o tempo limite vira ``None`` em vez de erro."""
    try:
        return conn.execute(query).fetchone()
    except psycopg.errors.QueryCanceled:
        conn.rollback()
        return None


def source_date_range(
    conn: psycopg.Connection, source: ExternalSource, info: reader.TableInfo
) -> tuple[date | None, date | None]:
    """Primeiro e último dia da fonte; ``None`` se não há coluna Date ou estourou o tempo."""
    date_column = info.columns.get("Date")
    if date_column is None:
        return None, None
    query = sql.SQL("SELECT min({c}), max({c}) FROM {t}").format(
        c=sql.Identifier(date_column.actual), t=relation_identifier(source.table)
    )
    row = _query_or_none(conn, query)
    return (None, None) if row is None else (_as_date(row[0]), _as_date(row[1]))


def source_row_count(conn: psycopg.Connection, source: ExternalSource) -> int | None:
    query = sql.SQL("SELECT count(*) FROM {t}").format(t=relation_identifier(source.table))
    row = _query_or_none(conn, query)
    return None if row is None else row[0]


def _check(key: str, label: str, status: str, detail: str) -> dict[str, str]:
    return {"key": key, "label": label, "status": status, "detail": detail}


def _failed_report(source: ExternalSource, message: str) -> dict[str, Any]:
    return {
        "compatible": False,
        "checks": [_check("connection", "Conexão", "fail", message)],
        "missing_columns": [],
        "wrong_types": [],
        "has_ground_truth": False,
        "has_typology": False,
        "row_count": None,
        "date_first": None,
        "date_last": None,
        "sample": {"size": 0, "valid": False, "errors": []},
        "overlap": None,
        "suggestion": None,
    }


def build_report(
    source: ExternalSource, dataset_conn: Connection | None, dataset_slug: str
) -> dict[str, Any]:
    """Conecta (somente leitura), confere o formato e compara com o conjunto atual."""
    try:
        with open_readonly(source) as conn:
            return _inspect(conn, source, dataset_conn, dataset_slug)
    except SourceError as exc:
        return _failed_report(source, str(exc))


def _inspect(
    conn: psycopg.Connection,
    source: ExternalSource,
    dataset_conn: Connection | None,
    dataset_slug: str,
) -> dict[str, Any]:
    checks = [
        _check("connection", "Conexão", "ok", "Conectou ao servidor em modo somente leitura.")
    ]
    info = reader.describe_table(conn, source)
    if not info.exists:
        checks.append(
            _check(
                "table",
                "Tabela de origem",
                "fail",
                "A tabela não existe ou o usuário não enxerga as colunas dela.",
            )
        )
        report = _failed_report(source, "")
        report["checks"] = checks
        return report
    checks.append(_check("table", "Tabela de origem", "ok", "Tabela encontrada."))

    missing = reader.missing_columns(info)
    wrong = reader.wrong_types(info)
    checks.append(
        _check(
            "columns",
            "Colunas obrigatórias",
            "fail" if missing else "ok",
            ("Faltam: " + ", ".join(missing) + ".") if missing else "Todas as 10 colunas existem.",
        )
    )
    checks.append(
        _check(
            "types",
            "Tipos das colunas",
            "fail" if wrong else "ok",
            (
                "; ".join(
                    f"{w['column']}: esperado {w['expected']}, veio {w['found']}" for w in wrong
                )
                if wrong
                else "Os tipos servem para o formato do SAML-D."
            ),
        )
    )
    if source.control_column:
        control = info.control
        if control is None:
            checks.append(
                _check("control", "Coluna de controle", "fail", "A coluna não existe na tabela.")
            )
        elif control.data_type not in reader.CONTROL_TYPES:
            checks.append(
                _check(
                    "control",
                    "Coluna de controle",
                    "fail",
                    f"Use uma coluna de data/hora ou número crescente; esta é {control.data_type}.",
                )
            )
        else:
            checks.append(
                _check(
                    "control",
                    "Coluna de controle",
                    "ok",
                    f"{control.actual} ({control.data_type}) serve para ler só o que for novo.",
                )
            )
    else:
        checks.append(
            _check(
                "control",
                "Coluna de controle",
                "info",
                "Não informada: sem ela só dá para importar o histórico, não acompanhar.",
            )
        )

    row_count = source_row_count(conn, source)
    source_first, source_last = source_date_range(conn, source, info)

    sample_size = 0
    errors: list[dict[str, Any]] = []
    sample_ok = False
    sample: list[dict[str, Any]] = []
    if not missing:
        sample = reader.sample_rows(conn, source, info, SAMPLE_SIZE)
        sample_size = len(sample)
        try:
            reader.parse_rows(info, sample, first_line=1)
            sample_ok = sample_size > 0
        except InvalidTransactionsError as exc:
            errors = [
                {"line": e.line, "column": e.column, "message": e.message}
                for e in exc.errors[:MAX_REPORTED_ERRORS]
            ]
    if missing:
        checks.append(_check("sample", "Amostra validada", "fail", "Faltam colunas para validar."))
    elif sample_ok:
        checks.append(
            _check(
                "sample",
                "Amostra validada",
                "ok",
                f"{sample_size} linhas passaram nas regras da ingestão.",
            )
        )
    elif not errors:
        checks.append(_check("sample", "Amostra validada", "fail", "A tabela está vazia."))
    else:
        first = errors[0]
        where = f"linha {first['line']}" + (
            f", coluna {first['column']}" if first["column"] else ""
        )
        checks.append(
            _check("sample", "Amostra validada", "fail", f"Erro na {where}: {first['message']}")
        )

    checks.append(
        _check(
            "ground_truth",
            "Gabarito (Is_laundering)",
            "info",
            "A fonte tem gabarito: dá para medir e retreinar."
            if info.has_ground_truth
            else "A fonte não tem gabarito: só haverá notas do modelo, sem retreino.",
        )
    )

    compatible = all(c["status"] != "fail" for c in checks)
    overlap = _overlap(sample, source_first, source_last, dataset_conn, dataset_slug)
    return {
        "compatible": compatible,
        "checks": checks,
        "missing_columns": missing,
        "wrong_types": wrong,
        "has_ground_truth": info.has_ground_truth,
        "has_typology": "Laundering_type" in info.columns,
        "row_count": row_count,
        "date_first": source_first.isoformat() if source_first else None,
        "date_last": source_last.isoformat() if source_last else None,
        "sample": {"size": sample_size, "valid": sample_ok, "errors": errors},
        "overlap": overlap,
        "suggestion": suggest(compatible, overlap, info.has_ground_truth),
    }


def _overlap(
    sample: list[dict[str, Any]],
    source_first: date | None,
    source_last: date | None,
    dataset_conn: Connection | None,
    dataset_slug: str,
) -> dict[str, Any] | None:
    if dataset_conn is None:
        return None
    current = dataset_range(dataset_conn)
    accounts = sorted(
        {
            a
            for row in sample
            for a in (
                _lenient_account(row.get("Sender_account")),
                _lenient_account(row.get("Receiver_account")),
            )
            if a is not None
        }
    )
    known_pct: float | None = None
    if accounts and current.first is not None:
        known = dataset_conn.execute(
            text(
                "SELECT count(*) FROM unnest(CAST(:accounts AS bigint[])) AS a(account) "
                "WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.sender = a.account) "
                "OR EXISTS (SELECT 1 FROM transactions t WHERE t.receiver = a.account)"
            ),
            {"accounts": accounts},
        ).scalar_one()
        known_pct = round(100 * known / len(accounts), 1)
    return {
        "dataset": dataset_slug,
        "sample_accounts": len(accounts),
        "known_accounts_pct": known_pct,
        "dates": classify_dates(source_first, source_last, current),
        "dataset_first": current.first.isoformat() if current.first else None,
        "dataset_last": current.last.isoformat() if current.last else None,
    }


def suggest(
    compatible: bool, overlap: dict[str, Any] | None, has_ground_truth: bool
) -> dict[str, str | None] | None:
    """Sugestão (nunca decisão) de relação com o conjunto atual."""
    if not compatible:
        return {
            "relation": None,
            "message": "Corrija os itens marcados em vermelho antes de importar.",
        }
    if overlap is None or overlap["dates"] in ("empty_dataset", "unknown"):
        return {
            "relation": None,
            "message": "Sem dados no conjunto atual para comparar: escolha pela origem dos dados.",
        }
    pct = overlap["known_accounts_pct"]
    dates = overlap["dates"]
    if pct is not None and pct >= 50 and dates == "continue":
        return {
            "relation": "extend",
            "message": (
                f"{pct:g}% das contas da amostra já existem e as datas vêm logo depois dos "
                "dados atuais: parece continuar o conjunto atual."
            ),
        }
    if pct is not None and pct >= SAME_BASE_KNOWN_PCT and dates == "overlap":
        # Pré-seleciona o conjunto separado (continuar é recusado com datas que cruzam), mas
        # avisa que, se for a mesma base, o melhor pode ser não importar.
        return {
            "relation": "new_dataset",
            "message": (
                f"{pct:g}% das contas da amostra já existem e as datas cruzam as do conjunto "
                "atual: parece ser a mesma base já carregada, e importar duplicaria transações. "
                "Confira a origem; se for mesmo outra base, importe como conjunto separado."
            ),
        }
    if pct is not None and pct >= 50 and dates == "overlap":
        return {
            "relation": "new_dataset",
            "message": (
                f"{pct:g}% das contas já existem, mas as datas cruzam períodos do conjunto atual "
                "(semanas fechadas não mudam): prefira um conjunto separado."
            ),
        }
    if (pct is not None and pct < 10) or dates == "other_era":
        return {
            "relation": "new_dataset",
            "message": (
                "Poucas contas em comum ou datas de outra época: parece outro conjunto de dados "
                "com a mesma estrutura."
            ),
        }
    return {
        "relation": None,
        "message": "O parecer é incerto (contas e datas não apontam um lado): decida pela origem.",
    }
