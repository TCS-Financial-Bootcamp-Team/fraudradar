"""Leitura de uma tabela externa no formato do SAML-D, em lotes e sem SQL do usuário.

Só a lista fixa de colunas de ``SOURCE_COLUMNS`` é selecionada; os nomes reais vêm do catálogo
da própria fonte (``information_schema``), são citados como identificadores e a comparação com os
nomes do SAML-D ignora maiúsculas. O gabarito (``Is_laundering``/``Laundering_type``), quando a
fonte tem, sai separado das transações: quem grava só o põe em ``ground_truth``.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, NamedTuple

import psycopg
from psycopg import sql

from fraudradar.data import ingestion
from fraudradar.data.ingestion import InvalidTransactionsError, Transaction, ValidationError
from fraudradar.data.saml_d import clean_typology
from fraudradar.data.schema import TRANSACTION_COLUMNS
from fraudradar.sources.connection import (
    SOURCE_COLUMNS,
    ExternalSource,
    SourceError,
    relation_identifier,
    split_relation,
    validate_identifier,
)

BATCH_SIZE = 5_000
UNKNOWN_TYPOLOGY = "Unknown"

_TEXT = ("text", "character varying", "character")
_INTEGER = ("smallint", "integer", "bigint")
_NUMBER = (*_INTEGER, "numeric", "real", "double precision")
# Tipos aceitos por coluna e como aparecem no relatório.
EXPECTED_TYPES: dict[str, tuple[str, tuple[str, ...]]] = {
    "Time": ("hora ou texto HH:MM[:SS]", ("time without time zone", "time with time zone", *_TEXT)),
    "Date": (
        "data ou texto AAAA-MM-DD",
        ("date", "timestamp without time zone", "timestamp with time zone", *_TEXT),
    ),
    "Sender_account": ("inteiro ou texto numérico", (*_INTEGER, "numeric", *_TEXT)),
    "Receiver_account": ("inteiro ou texto numérico", (*_INTEGER, "numeric", *_TEXT)),
    "Amount": ("número", (*_NUMBER, *_TEXT)),
    "Payment_currency": ("texto", _TEXT),
    "Received_currency": ("texto", _TEXT),
    "Sender_bank_location": ("texto", _TEXT),
    "Receiver_bank_location": ("texto", _TEXT),
    "Payment_type": ("texto", _TEXT),
    "Is_laundering": ("0/1 ou booleano", (*_INTEGER, "numeric", "boolean", *_TEXT)),
    "Laundering_type": ("texto", _TEXT),
}
# Tipos que o Postgres compara e ordena como o valor de controle (data/hora ou número).
CONTROL_TYPES = (
    "date",
    "timestamp without time zone",
    "timestamp with time zone",
    *_NUMBER,
)


class SourceColumn(NamedTuple):
    actual: str  # nome real na fonte
    data_type: str


@dataclass(frozen=True)
class TableInfo:
    """Colunas da fonte que casam com as do SAML-D (chave: nome canônico) e a de controle."""

    columns: dict[str, SourceColumn]
    control: SourceColumn | None
    exists: bool

    @property
    def has_ground_truth(self) -> bool:
        return "Is_laundering" in self.columns


class SourceBatch(NamedTuple):
    transactions: list[Transaction]
    truth: list[tuple[int, str, str]] | None  # (label, original_typology, typology) por linha
    last_control: str | None
    rows_read: int


def describe_table(conn: psycopg.Connection, source: ExternalSource) -> TableInfo:
    """Lê o catálogo da fonte: quais colunas do SAML-D a tabela tem e de que tipo."""
    schema, name = split_relation(source.table)
    rows = conn.execute(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_name = %s AND table_schema = COALESCE(%s, current_schema()) "
        "ORDER BY ordinal_position",
        (name, schema),
    ).fetchall()
    by_lower: dict[str, SourceColumn] = {}
    for column_name, data_type in rows:
        by_lower.setdefault(column_name.lower(), SourceColumn(column_name, data_type))
    columns = {c: by_lower[c.lower()] for c in SOURCE_COLUMNS if c.lower() in by_lower}
    control = None
    if source.control_column:
        validate_identifier(source.control_column, "nome da coluna de controle")
        control = by_lower.get(source.control_column.lower())
    return TableInfo(columns=columns, control=control, exists=bool(rows))


def wrong_types(info: TableInfo) -> list[dict[str, str]]:
    """Colunas presentes cujo tipo não serve para o formato do SAML-D."""
    wrong = []
    for canonical, found in info.columns.items():
        label, accepted = EXPECTED_TYPES[canonical]
        if found.data_type not in accepted:
            wrong.append({"column": canonical, "expected": label, "found": found.data_type})
    return wrong


def missing_columns(info: TableInfo) -> list[str]:
    return [c for c in TRANSACTION_COLUMNS if c not in info.columns]


def _select(
    source: ExternalSource,
    info: TableInfo,
    *,
    after: str | None,
    limit: int | None,
    ordered: bool,
) -> tuple[sql.Composed, tuple[Any, ...]]:
    chosen = [c for c in SOURCE_COLUMNS if c in info.columns]
    fields = [sql.Identifier(info.columns[c].actual) for c in chosen]
    parts = [
        sql.SQL("SELECT "),
        sql.SQL(", ").join(fields),
    ]
    if info.control is not None:
        parts += [sql.SQL(", "), sql.Identifier(info.control.actual)]
    parts += [sql.SQL(" FROM "), relation_identifier(source.table)]
    params: list[Any] = []
    if info.control is not None:
        control = sql.Identifier(info.control.actual)
        if after is not None:
            # O texto vira o tipo da coluna de controle (data, hora ou número) no servidor.
            parts += [sql.SQL(" WHERE "), control, sql.SQL(" > %s")]
            params.append(after)
        if ordered:
            parts += [sql.SQL(" ORDER BY "), control]
    if limit is not None:
        parts += [sql.SQL(" LIMIT %s")]
        params.append(limit)
    return sql.Composed(parts), tuple(params)


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _normalize(column: str, value: Any) -> Any:
    """Valor da fonte -> texto no formato que o validador da ingestão de CSV espera."""
    if value is None:
        return ""
    if column == "Date" and isinstance(value, datetime | date):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    if column == "Time" and isinstance(value, time):
        return value.replace(microsecond=0, tzinfo=None).isoformat()
    if column in ("Sender_account", "Receiver_account") and isinstance(value, Decimal):
        return str(int(value)) if value == value.to_integral_value() else str(value)
    if column == "Amount":
        return repr(value) if isinstance(value, float) else str(value)
    return _text(value)


def to_record(info: TableInfo, row: dict[str, Any]) -> dict[str, str]:
    """Linha da fonte (chave: nome canônico) -> registro com os nomes do CSV."""
    return {c: _normalize(c, row.get(c)) for c in TRANSACTION_COLUMNS}


def parse_label(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    text_value = str(value).strip().lower() if value is not None else ""
    if text_value in {"0", "0.0", "false", "f"}:
        return 0
    if text_value in {"1", "1.0", "true", "t"}:
        return 1
    raise ValueError("Is_laundering deve ser 0 ou 1.")


def parse_truth(row: dict[str, Any]) -> tuple[int, str, str]:
    label = parse_label(row.get("Is_laundering"))
    original = _text(row.get("Laundering_type")).strip() or UNKNOWN_TYPOLOGY
    return label, original, clean_typology(original)


def parse_rows(
    info: TableInfo, rows: list[dict[str, Any]], *, first_line: int
) -> tuple[list[Transaction], list[tuple[int, str, str]] | None]:
    """Valida as linhas com o validador da ingestão de CSV; erro em qualquer uma recusa o lote."""
    transactions: list[Transaction] = []
    truth: list[tuple[int, str, str]] | None = [] if info.has_ground_truth else None
    errors: list[ValidationError] = []
    for offset, row in enumerate(rows):
        line = first_line + offset
        try:
            transactions.append(ingestion.parse_transaction(to_record(info, row), line))
            if truth is not None:
                truth.append(parse_truth(row))
        except InvalidTransactionsError as exc:
            errors += exc.errors
        except ValueError as exc:
            errors.append(ValidationError(line, "Is_laundering", str(exc)))
        if len(errors) >= ingestion.MAX_ERRORS:
            break
    if errors:
        raise InvalidTransactionsError(errors[: ingestion.MAX_ERRORS])
    return transactions, truth


def sample_rows(
    conn: psycopg.Connection, source: ExternalSource, info: TableInfo, size: int
) -> list[dict[str, Any]]:
    query, params = _select(source, info, after=None, limit=size, ordered=False)
    return _fetch(conn, query, params, info)


def _fetch(conn, query, params, info: TableInfo) -> list[dict[str, Any]]:
    chosen = [c for c in SOURCE_COLUMNS if c in info.columns]
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        return [_row_dict(chosen, info, values) for values in cursor.fetchall()]


def _row_dict(chosen: list[str], info: TableInfo, values: tuple[Any, ...]) -> dict[str, Any]:
    row = dict(zip(chosen, values, strict=False))
    if info.control is not None:
        row["__control"] = values[len(chosen)]
    return row


def max_control(conn: psycopg.Connection, source: ExternalSource, info: TableInfo) -> str | None:
    """Maior valor da coluna de controle agora (posição inicial de quem só acompanha)."""
    if info.control is None:
        return None
    query = sql.SQL("SELECT max({c}) FROM {t}").format(
        c=sql.Identifier(info.control.actual), t=relation_identifier(source.table)
    )
    value = conn.execute(query).fetchone()[0]
    return None if value is None else str(value)


def read_batches(
    conn: psycopg.Connection,
    source: ExternalSource,
    info: TableInfo,
    *,
    after: str | None = None,
    batch_size: int = BATCH_SIZE,
) -> Iterator[SourceBatch]:
    """Linhas depois de ``after`` (pela coluna de controle), em ordem, validadas por lote.

    Usa um cursor nomeado (servidor): a tabela não vai inteira para a memória e linhas com o
    mesmo valor de controle não se perdem na fronteira entre lotes.
    """
    if info.control is None:
        raise SourceError("A coluna de controle não existe na tabela de origem.")
    query, params = _select(source, info, after=after, limit=None, ordered=True)
    chosen = [c for c in SOURCE_COLUMNS if c in info.columns]
    line = 1
    with conn.cursor(name="fraudradar_read") as cursor:
        cursor.execute(query, params)
        while True:
            values = cursor.fetchmany(batch_size)
            if not values:
                return
            rows = [_row_dict(chosen, info, v) for v in values]
            transactions, truth = parse_rows(info, rows, first_line=line + 1)
            line += len(rows)
            last = rows[-1]["__control"]
            yield SourceBatch(transactions, truth, None if last is None else str(last), len(rows))
