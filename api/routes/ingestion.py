"""Ingestão de transações no formato do SAML-D, sem os rótulos de avaliação.

- POST /ingestion/csv           — arquivo CSV (multipart, campo `file`); tudo ou nada
- POST /ingestion/transactions  — uma transação em JSON
- GET  /ingestion/connections   — fontes Postgres externas: lista vazia por enquanto

As transações entram com status `received`: o score sai quando o worker processa a semana.
Cadastrar e sincronizar fontes Postgres responde 501: guardar credenciais de terceiros e
abrir conexão para hosts escolhidos pelo usuário (SSRF) pedem um desenho próprio.
"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile, status
from fastapi.routing import APIRoute
from starlette.types import Message

from api.dependencies import CurrentUser, DbConnection
from api.repositories import ingestion
from api.schemas.ingestion import DataSource, DataSources, Receipt, TransactionRequest
from fraudradar.config import get_settings

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

NOT_IMPLEMENTED_MSG = "O cadastro de fontes Postgres ainda não está disponível nesta versão da API."
_RESPONSES = {501: {"description": NOT_IMPLEMENTED_MSG}}


def _not_implemented() -> HTTPException:
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, NOT_IMPLEMENTED_MSG)


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


@router.get("/connections", response_model=DataSources)
def list_data_sources() -> DataSources:
    return DataSources(items=[])


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


@router.post("/connections", response_model=DataSource, responses=_RESPONSES)
def register_data_source() -> DataSource:
    raise _not_implemented()


@router.post("/connections/{source_id}/sync", response_model=DataSource, responses=_RESPONSES)
def sync_data_source(source_id: str) -> DataSource:
    raise _not_implemented()
