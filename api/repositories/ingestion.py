"""Ingestão: grava o envio (`ingestions`), as transações e a auditoria na transação da requisição.

A validação é a de fraudradar.data.ingestion, a mesma que o worker vai usar. Nada é gravado em
`ground_truth`: rótulos não entram pela API.
"""

import json
import re
from typing import Any, BinaryIO

from fastapi import status
from sqlalchemy import Connection, text

from api.dependencies import User
from api.errors import AppError
from api.schemas.ingestion import Receipt, TransactionRequest
from fraudradar.config import get_settings
from fraudradar.data import ingestion
from fraudradar.data.ingestion import Transaction, ValidationError

# Colunas gravadas: as de Transaction, na ordem dela, e o envio de origem.
COLUMNS = (*Transaction._fields, "ingestion_id")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def _format_thousands(number: int) -> str:
    return f"{number:,}".replace(",", ".")


def _validation_error(errors: list[ValidationError], *loc_prefix: str) -> AppError:
    """422 no formato do Pydantic ({type, loc, msg}); no arquivo, a msg traz linha e coluna.
    Erro de estrutura do arquivo leva também ``code`` e ``params`` (o front traduz por eles)."""
    details = []
    coded: list[dict[str, Any] | None] = []
    for err in errors:
        msg = err.message
        if err.line is not None:
            where = f"Linha {err.line}" + (f", coluna {err.column}" if err.column else "")
            msg = f"{where}: {msg}"
        loc = [*loc_prefix, *(p for p in (err.line, err.column) if p is not None)]
        details.append({"type": "value_error", "loc": loc, "msg": msg})
        coded.append(
            {
                "code": err.code,
                "params": {
                    **(err.params or {}),
                    **({"line": err.line} if err.line is not None else {}),
                    **({"column": err.column} if err.column else {}),
                },
            }
            if err.code
            else None
        )
    # `detail` segue no formato do Pydantic; o código de cada item vai em `params.errors`, na
    # mesma ordem (None nos erros sem código, como os de campo).
    return AppError(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "ingestion.invalid",
        details,
        {"count": len(details), "errors": coded},
    )


def _sanitize_file_name(name: str | None) -> str | None:
    """Só o nome, sem pastas nem caracteres de controle, com até 255 caracteres."""
    cleaned = _CONTROL_CHARS_RE.sub("", (name or "").replace("\\", "/").rsplit("/", 1)[-1]).strip()
    return cleaned[:255] or None


def _create_ingestion(
    conn: Connection, source: str, file_name: str | None, row_count: int, user: User
) -> int:
    return conn.execute(
        text(
            "INSERT INTO ingestions (source, file_name, row_count, created_by)"
            " VALUES (:source, :file_name, :row_count, :created_by) RETURNING id"
        ),
        {
            "source": source,
            "file_name": file_name,
            "row_count": row_count,
            "created_by": user.name,
        },
    ).scalar_one()


def _audit(conn: Connection, ingestion_id: int, user: User, details: dict) -> None:
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
            " VALUES (:actor, 'ingestion', 'ingestion', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "id": str(ingestion_id),
            "details": json.dumps({**details, "user_id": user.id}),
        },
    )


def _build_receipt(ingestion_id: int, row_count: int) -> Receipt:
    count_text = (
        "1 transação recebida"
        if row_count == 1
        else f"{_format_thousands(row_count)} transações recebidas"
    )
    return Receipt(
        id=str(ingestion_id),
        status="received",
        message=f"{count_text}. O score sai no processamento semanal.",
        message_code="ingestion.received",
        message_params={"count": row_count},
    )


def save_csv(conn: Connection, file: BinaryIO, file_name: str | None, user: User) -> Receipt:
    """Valida o arquivo inteiro e só então grava por COPY. Uma linha com erro recusa tudo."""
    max_rows = get_settings().ingestion_max_rows
    try:
        # 1ª leitura: valida antes de tocar no banco, então arquivo com erro não abre COPY.
        row_count = sum(1 for _ in ingestion.read_csv(file, max_rows=max_rows))
    except ingestion.TooManyRowsError as exc:
        msg = (
            f"O arquivo passa de {_format_thousands(exc.limit)} linhas."
            " Divida o CSV em partes menores."
        )
        raise AppError(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "ingestion.too_many_rows",
            msg,
            {"limit": exc.limit},
        ) from exc
    except ingestion.InvalidTransactionsError as exc:
        raise _validation_error(exc.errors, "body", "file") from exc
    sanitized_name = _sanitize_file_name(file_name)
    ingestion_id = _create_ingestion(conn, "csv", sanitized_name, row_count, user)
    # 2ª leitura, do arquivo já validado: COPY pela conexão psycopg da transação da requisição.
    file.seek(0)
    with (
        conn.connection.driver_connection.cursor() as cursor,
        cursor.copy(f"COPY transactions ({', '.join(COLUMNS)}) FROM STDIN") as copy,
    ):
        for tx in ingestion.read_csv(file):
            copy.write_row((*tx, ingestion_id))
    _audit(
        conn,
        ingestion_id,
        user,
        {"source": "csv", "row_count": row_count, "file_name": sanitized_name},
    )
    return _build_receipt(ingestion_id, row_count)


def save_transaction(conn: Connection, request: TransactionRequest, user: User) -> Receipt:
    try:
        tx = ingestion.parse_transaction(request.model_dump())
    except ingestion.InvalidTransactionsError as exc:
        raise _validation_error(exc.errors, "body") from exc
    ingestion_id = _create_ingestion(conn, "api", None, 1, user)
    conn.execute(
        text(
            f"INSERT INTO transactions ({', '.join(COLUMNS)})"
            f" VALUES ({', '.join(':' + col for col in COLUMNS)})"
        ),
        {**tx._asdict(), "ingestion_id": ingestion_id},
    )
    _audit(conn, ingestion_id, user, {"source": "api", "row_count": 1})
    return _build_receipt(ingestion_id, 1)
