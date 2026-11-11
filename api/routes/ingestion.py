"""Ingestão de transações no formato do SAML-D, sem os rótulos de avaliação.

- POST /ingestion/csv           — arquivo CSV (multipart, campo `file`); tudo ou nada
- POST /ingestion/transactions  — uma transação em JSON
- GET    /ingestion/connections               — conexões com bancos Postgres externos
- POST   /ingestion/connections               — cadastra (senha só entra aqui, cifrada)
- DELETE /ingestion/connections/{id}          — remove a conexão (os dados importados ficam)
- POST   /ingestion/connections/{id}/test     — relatório de compatibilidade
- POST   /ingestion/connections/{id}/import   — as duas respostas (relação e processamento)

As transações entram com status `received`: o score sai quando o worker processa a semana.
Conexões externas: docs/external-data.md. A senha é cifrada, o host precisa estar em
EXTERNAL_DB_ALLOWED_HOSTS (proteção contra SSRF) e toda leitura na fonte é somente leitura.
"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import APIRouter, File, Header, HTTPException, Request, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.types import Message

from api.dependencies import CurrentUser, DbConnection, PublicDbConnection
from api.repositories import connections as connections_repository
from api.repositories import ingestion
from api.schemas.connections import (
    CompatibilityReport,
    Connection,
    ConnectionCreate,
    Connections,
    ImportRequest,
    ImportResponse,
)
from api.schemas.ingestion import Receipt, TransactionRequest
from fraudradar.config import get_settings

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


def _payload_too_large(limit: int) -> HTTPException:
    size = f"{limit // 2**20} MiB" if limit % 2**20 == 0 else f"{limit} bytes"
    return HTTPException(
        status.HTTP_413_CONTENT_TOO_LARGE,
        f"O envio passa do limite de {size}. Divida o CSV em partes menores.",
    )


class LimitedBodyRoute(APIRoute):
    """Rota que recusa com 413 o corpo acima de INGESTION_MAX_BYTES.

    O Starlette não limita upload e lê o multipart antes de qualquer dependência (até da
    autenticação). Aqui os bytes são contados enquanto chegam, e a leitura para no limite.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handle = super().get_route_handler()

        async def handle_with_limit(request: Request) -> Response:
            limit = get_settings().ingestion_max_bytes
            declared = request.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > limit:
                raise _payload_too_large(limit)
            received = 0

            async def receive() -> Message:
                nonlocal received
                message = await request.receive()
                received += len(message.get("body", b""))
                if received > limit:
                    raise _payload_too_large(limit)
                return message

            return await handle(Request(request.scope, receive))

        return handle_with_limit


def upload_csv(
    file: Annotated[UploadFile, File(description="CSV do SAML-D sem as colunas de avaliação")],
    conn: DbConnection,
    user: CurrentUser,
) -> Receipt:
    return ingestion.save_csv(conn, file.file, file.filename, user)


router.add_api_route(
    "/csv",
    upload_csv,
    methods=["POST"],
    response_model=Receipt,
    status_code=status.HTTP_201_CREATED,
    responses={413: {"description": "Arquivo acima do limite de bytes ou de linhas"}},
    route_class_override=LimitedBodyRoute,
)


@router.post("/transactions", response_model=Receipt, status_code=status.HTTP_201_CREATED)
def submit_transaction(
    request: TransactionRequest, conn: DbConnection, user: CurrentUser
) -> Receipt:
    return ingestion.save_transaction(conn, request, user)


@router.get("/connections", response_model=Connections)
def list_connections(conn: PublicDbConnection) -> Connections:
    return connections_repository.list_connections(conn)


class NoEchoRoute(APIRoute):
    """Rota cujo 422 não devolve o corpo recebido (``input``): ele traz a senha da conexão."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handle = super().get_route_handler()

        async def handle_without_echo(request: Request) -> Response:
            try:
                return await handle(request)
            except RequestValidationError as exc:
                cleaned = [
                    {key: value for key, value in error.items() if key not in ("input", "ctx")}
                    for error in exc.errors()
                ]
                raise RequestValidationError(cleaned) from None

        return handle_without_echo


def create_connection(
    request: ConnectionCreate, conn: PublicDbConnection, user: CurrentUser
) -> Connection:
    return connections_repository.create_connection(conn, request, user)


router.add_api_route(
    "/connections",
    create_connection,
    methods=["POST"],
    response_model=Connection,
    status_code=status.HTTP_201_CREATED,
    responses={
        422: {"description": "Host fora da lista liberada, tabela ou coluna inválida"},
        503: {"description": "CONNECTIONS_SECRET_KEY não configurada"},
    },
    route_class_override=NoEchoRoute,
)


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(connection_id: int, conn: PublicDbConnection, user: CurrentUser) -> Response:
    connections_repository.delete_connection(conn, connection_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/connections/{connection_id}/test", response_model=CompatibilityReport)
def test_connection(
    connection_id: int,
    conn: DbConnection,
    user: CurrentUser,
    x_dataset: Annotated[str, Header(alias="X-Dataset")] = "saml-d",
) -> CompatibilityReport:
    """Compara a fonte com o formato do SAML-D e com o conjunto do cabeçalho X-Dataset."""
    return connections_repository.check_compatibility(conn, connection_id, x_dataset, user)


@router.post(
    "/connections/{connection_id}/import",
    response_model=ImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def import_connection(
    connection_id: int,
    request: ImportRequest,
    conn: DbConnection,
    user: CurrentUser,
    x_dataset: Annotated[str, Header(alias="X-Dataset")] = "saml-d",
) -> ImportResponse:
    return connections_repository.start_import(conn, connection_id, request, x_dataset, user)
