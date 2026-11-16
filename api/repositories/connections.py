"""Conexões com bancos Postgres externos: cadastro, teste de compatibilidade e importação.

A senha chega em ``ConnectionCreate``, é cifrada antes do INSERT e só é decifrada aqui, em
memória, para abrir a conexão de leitura. Nenhuma resposta, mensagem de erro ou linha de
``audit_log`` carrega a senha. As leituras na fonte são somente leitura (fraudradar.sources).
"""

import json
import logging
from typing import Any

from fastapi import status
from sqlalchemy import Connection, text

from api.dependencies import User
from api.errors import AppError
from api.schemas.connections import (
    CompatibilityReport,
    ConnectionCreate,
    Connections,
    ImportRequest,
    ImportResponse,
)
from api.schemas.connections import Connection as ConnectionResponse
from api.schemas.datasets import JobResponse
from fraudradar.datasets import (
    DatasetAlreadyExistsError,
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    create_dataset,
    resolve_dataset,
    use_dataset,
)
from fraudradar.sources import compatibility, reader
from fraudradar.sources.connection import (
    ExternalSource,
    SourceError,
    check_host,
    check_port,
    open_readonly,
    split_relation,
    validate_identifier,
)
from fraudradar.sources.crypto import (
    CannotDecryptError,
    SecretKeyMissingError,
    decrypt_password,
    encrypt_password,
)

log = logging.getLogger("api.connections")

_COLUMNS = (
    "id, name, host, port, database, username, password_encrypted, source_table, control_column, "
    "last_position, status, compatibility, last_error, dataset, mode, last_synced_at"
)


def _mask(value: str) -> str:
    return (value[:3] if len(value) > 3 else value[:1]) + "•••"


def _response(row: Any) -> ConnectionResponse:
    report = row["compatibility"]
    return ConnectionResponse(
        id=str(row["id"]),
        name=row["name"],
        masked_host=_mask(row["host"]),
        masked_database=_mask(row["database"]),
        table=row["source_table"],
        control_column=row["control_column"],
        status=row["status"],
        last_error=row["last_error"],
        last_synced_at=row["last_synced_at"],
        dataset=row["dataset"],
        mode=row["mode"],
        compatibility=CompatibilityReport.model_validate(report) if report else None,
    )


def _audit(conn: Connection, user: User, action: str, connection_id: int, details: dict) -> None:
    # Só metadados: nunca a senha, a chave nem o relatório inteiro.
    conn.execute(
        text(
            "INSERT INTO public.audit_log (actor, action, entity, entity_id, details) "
            "VALUES (:actor, :action, 'connection', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "action": action,
            "id": str(connection_id),
            "details": json.dumps({**details, "user_id": user.id}),
        },
    )


def _unprocessable(code: str, message: str, params: dict[str, Any] | None = None) -> AppError:
    return AppError(status.HTTP_422_UNPROCESSABLE_CONTENT, code, message, params)


def _from_source(exc: SourceError) -> AppError:
    return AppError(status.HTTP_422_UNPROCESSABLE_CONTENT, exc.code, str(exc), exc.params)


def _fetch_row(conn: Connection, connection_id: int, *, for_update: bool = False) -> Any:
    row = (
        conn.execute(
            text(
                f"SELECT {_COLUMNS} FROM public.external_connections WHERE id = :id"
                + (" FOR UPDATE" if for_update else "")
            ),
            {"id": connection_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise AppError(status.HTTP_404_NOT_FOUND, "connection.not_found", "Conexão não encontrada.")
    return row


def _source_from_row(row: Any, control_column: str | None = None) -> ExternalSource:
    try:
        password = decrypt_password(row["password_encrypted"])
    except (SecretKeyMissingError, CannotDecryptError) as exc:
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE, "connection.secret_key", str(exc)
        ) from exc
    return ExternalSource(
        host=row["host"],
        port=row["port"],
        database=row["database"],
        user=row["username"],
        password=password,
        table=row["source_table"],
        control_column=control_column or row["control_column"],
    )


def list_connections(conn: Connection) -> Connections:
    rows = (
        conn.execute(
            text(f"SELECT {_COLUMNS} FROM public.external_connections ORDER BY created_at, id")
        )
        .mappings()
        .all()
    )
    return Connections(items=[_response(row) for row in rows])


def create_connection(
    conn: Connection, request: ConnectionCreate, user: User
) -> ConnectionResponse:
    try:
        host = check_host(request.host)
        check_port(request.port)
        split_relation(request.table)
        if request.control_column:
            validate_identifier(request.control_column, "nome da coluna de controle")
    except SourceError as exc:
        raise _from_source(exc) from exc
    try:
        encrypted = encrypt_password(request.password.get_secret_value())
    except SecretKeyMissingError as exc:
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE, "connection.secret_key", str(exc)
        ) from exc
    row = (
        conn.execute(
            text(
                "INSERT INTO public.external_connections "
                "(name, host, port, database, username, password_encrypted, source_table, "
                "control_column, created_by) "
                "VALUES (:name, :host, :port, :database, :username, :password, :table, "
                ":control_column, :actor) "
                f"RETURNING {_COLUMNS}"
            ),
            {
                "name": request.name.strip(),
                "host": host,
                "port": request.port,
                "database": request.database.strip(),
                "username": request.user.strip(),
                "password": encrypted,
                "table": request.table.strip(),
                "control_column": request.control_column,
                "actor": user.name,
            },
        )
        .mappings()
        .one()
    )
    _audit(
        conn,
        user,
        "connection_created",
        row["id"],
        {"name": row["name"], "host": row["host"], "table": row["source_table"]},
    )
    return _response(row)


def delete_connection(conn: Connection, connection_id: int, user: User) -> None:
    row = _fetch_row(conn, connection_id, for_update=True)
    if row["status"] == "syncing":
        raise AppError(
            status.HTTP_409_CONFLICT,
            "connection.import_running_delete",
            "A importação desta conexão está em andamento. Aguarde terminar para remover.",
        )
    conn.execute(
        text("DELETE FROM public.external_connections WHERE id = :id"), {"id": connection_id}
    )
    _audit(conn, user, "connection_deleted", connection_id, {"name": row["name"]})


def check_compatibility(
    conn: Connection, connection_id: int, dataset_slug: str, user: User
) -> CompatibilityReport:
    row = _fetch_row(conn, connection_id, for_update=True)
    source = _source_from_row(row)
    report = compatibility.build_report(source, conn, dataset_slug)
    new_status = "connected" if report["compatible"] else "incompatible"
    if row["status"] == "syncing":
        new_status = "syncing"  # testar durante a importação não muda o andamento
    conn.execute(
        text(
            "UPDATE public.external_connections SET compatibility = CAST(:report AS jsonb), "
            "status = :status, last_error = NULL WHERE id = :id"
        ),
        {"report": json.dumps(report), "status": new_status, "id": connection_id},
    )
    _audit(
        conn,
        user,
        "connection_tested",
        connection_id,
        {"dataset": dataset_slug, "compatible": report["compatible"]},
    )
    return CompatibilityReport.model_validate(report)


def _enqueue(conn: Connection, kind: str, dataset: str, payload: dict, user: User) -> JobResponse:
    row = (
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by) "
                "VALUES (:kind, :dataset, CAST(:payload AS jsonb), :actor) RETURNING *"
            ),
            {"kind": kind, "dataset": dataset, "payload": json.dumps(payload), "actor": user.name},
        )
        .mappings()
        .one()
    )
    return JobResponse(
        id=str(row["id"]),
        kind=row["kind"],
        dataset=row["dataset"],
        status=row["status"],
        progress=row["progress"],
        message=row["message"],
        created_at=row["created_at"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
    )


def start_import(
    conn: Connection, connection_id: int, request: ImportRequest, current_slug: str, user: User
) -> ImportResponse:
    """Valida as duas respostas, prepara o conjunto de destino e enfileira o trabalho.

    ``extend`` usa o conjunto atual (o do X-Dataset); ``new_dataset`` cria um. Com histórico
    (``history``/``both``) enfileira ``import`` (que enfileira o ``process`` ao terminar); só
    acompanhar (``follow``) fixa a posição atual da fonte e enfileira ``process``.
    """
    row = _fetch_row(conn, connection_id, for_update=True)
    if row["status"] == "syncing":
        raise AppError(
            status.HTTP_409_CONFLICT,
            "connection.import_in_progress",
            "Já existe uma importação em andamento nesta conexão.",
        )
    if row["dataset"] is not None and row["last_synced_at"] is not None:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "connection.already_linked",
            "Esta conexão já foi ligada a um conjunto de dados. Cadastre outra conexão para "
            "importar de novo.",
        )
    try:
        validate_identifier(request.control_column, "nome da coluna de controle")
    except SourceError as exc:
        raise _from_source(exc) from exc
    source = _source_from_row(row, control_column=request.control_column)

    # Confere a fonte de novo (o teste pode ser antigo) e lê o que a decisão precisa.
    first_date, position = _inspect_source(source, request)

    destination = _destination(conn, row, request, current_slug, first_date)

    wants_history = request.mode in ("history", "both")
    conn.execute(
        text(
            "UPDATE public.external_connections SET dataset = :dataset, mode = :mode, "
            "control_column = :control, last_position = :position, last_error = NULL, "
            "status = :status, last_synced_at = :synced WHERE id = :id"
        ),
        {
            "dataset": destination,
            "mode": request.mode,
            "control": request.control_column,
            "position": None if wants_history else position,
            "status": "syncing" if wants_history else "connected",
            "synced": None if wants_history else _now(conn),
            "id": connection_id,
        },
    )
    if wants_history:
        job = _enqueue(
            conn,
            "import",
            destination,
            {"connection_id": connection_id, "mode": request.mode},
            user,
        )
    else:
        job = _enqueue(conn, "process", destination, {}, user)
    _audit(
        conn,
        user,
        "connection_import_started",
        connection_id,
        {"dataset": destination, "relation": request.relation, "mode": request.mode},
    )
    return ImportResponse(dataset=destination, job=job)


def _now(conn: Connection):
    return conn.execute(text("SELECT now()")).scalar_one()


def _inspect_source(source: ExternalSource, request: ImportRequest):
    """Revalida colunas, tipos e coluna de controle; devolve (primeira data, posição atual)."""
    try:
        with open_readonly(source) as ext:
            info = reader.describe_table(ext, source)
            if not info.exists:
                raise _unprocessable(
                    "connection.table_missing",
                    "A tabela de origem não existe ou não está visível.",
                )
            missing = reader.missing_columns(info)
            wrong = reader.wrong_types(info)
            if missing or wrong:
                raise _unprocessable(
                    "connection.table_incompatible",
                    "A tabela não é compatível com o formato do SAML-D. Rode o teste da conexão.",
                )
            if info.control is None:
                raise _unprocessable(
                    "source.control_missing",
                    "A coluna de controle não existe na tabela de origem.",
                )
            if info.control.data_type not in reader.CONTROL_TYPES:
                raise _unprocessable(
                    "connection.control_type",
                    "A coluna de controle deve ser de data/hora ou número crescente.",
                )
            first_date = None
            if request.mode in ("history", "both"):
                first_date, _ = compatibility.source_date_range(ext, source, info)
            position = reader.max_control(ext, source, info) if request.mode == "follow" else None
            return first_date, position
    except SourceError as exc:
        raise _from_source(exc) from exc


def _destination(
    conn: Connection, row: Any, request: ImportRequest, current_slug: str, first_date
) -> str:
    if request.relation == "extend":
        try:
            dataset = resolve_dataset(conn, current_slug)
        except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
            raise AppError(
                status.HTTP_404_NOT_FOUND,
                "dataset.not_found",
                f"Conjunto de dados '{current_slug}' não encontrado.",
                {"slug": current_slug},
            ) from exc
        use_dataset(conn, dataset)
        if request.mode in ("history", "both"):
            if first_date is None:
                raise _unprocessable(
                    "import.dates_unverifiable",
                    "Não foi possível conferir as datas da fonte para continuar o conjunto atual.",
                )
            current = compatibility.dataset_range(conn)
            if compatibility.closed_weeks_conflict(first_date, current):
                raise _unprocessable(
                    "import.closed_weeks",
                    f"As datas da fonte começam em {first_date.isoformat()}, antes da semana "
                    "aberta do conjunto atual. Semanas fechadas não mudam: escolha "
                    "«Outro dataset com a mesma estrutura».",
                    {"first_date": first_date.isoformat()},
                )
        return dataset.slug
    assert request.new_dataset is not None
    slug = request.new_dataset.slug
    if row["dataset"] == slug and row["last_synced_at"] is None:
        # Nova tentativa depois de uma importação que falhou: a carga é tudo ou nada, então o
        # conjunto criado antes continua vazio e pode ser reaproveitado.
        return slug
    try:
        return create_dataset(conn, name=request.new_dataset.name, slug=slug).slug
    except InvalidDatasetSlugError as exc:
        raise _unprocessable("dataset.invalid_slug", str(exc)) from exc
    except DatasetAlreadyExistsError as exc:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "dataset.exists",
            f"O conjunto de dados '{slug}' já existe.",
            {"slug": slug},
        ) from exc
    except ValueError as exc:
        raise _unprocessable("dataset.invalid", str(exc)) from exc
