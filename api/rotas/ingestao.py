"""Ingestão de transações no formato do SAML-D, sem os rótulos de avaliação.

- POST /ingestao/csv         — arquivo CSV (multipart, campo `arquivo`); tudo ou nada
- POST /ingestao/transacoes  — uma transação em JSON
- GET  /ingestao/conexoes    — fontes Postgres externas: lista vazia por enquanto

As transações entram com status `recebido`: o score sai quando o worker processa a semana.
Cadastrar e sincronizar fontes Postgres responde 501: guardar credenciais de terceiros e
abrir conexão para hosts escolhidos pelo usuário (SSRF) pedem um desenho próprio.
"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile, status
from fastapi.routing import APIRoute
from starlette.types import Message

from api.dependencias import Conexao, UsuarioAtual
from api.repositorios import ingestao
from api.schemas.ingestao import FonteDados, FontesDados, PedidoTransacao, Recibo
from fraudradar.config import get_settings

router = APIRouter(prefix="/ingestao", tags=["ingestao"])

NAO_IMPLEMENTADA = "O cadastro de fontes Postgres ainda não está disponível nesta versão da API."
_RESPOSTAS = {501: {"description": NAO_IMPLEMENTADA}}


def _nao_implementada() -> HTTPException:
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, NAO_IMPLEMENTADA)


def _grande_demais(limite: int) -> HTTPException:
    tamanho = f"{limite // 2**20} MiB" if limite % 2**20 == 0 else f"{limite} bytes"
    return HTTPException(
        status.HTTP_413_CONTENT_TOO_LARGE,
        f"O envio passa do limite de {tamanho}. Divida o CSV em partes menores.",
    )


class CorpoLimitado(APIRoute):
    """Rota que recusa com 413 o corpo acima de INGESTAO_MAX_BYTES.

    O Starlette não limita upload e lê o multipart antes de qualquer dependência (até da
    autenticação). Aqui os bytes são contados enquanto chegam, e a leitura para no limite.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        tratar = super().get_route_handler()

        async def tratar_com_limite(request: Request) -> Response:
            limite = get_settings().ingestao_max_bytes
            declarado = request.headers.get("content-length", "")
            if declarado.isdigit() and int(declarado) > limite:
                raise _grande_demais(limite)
            recebido = 0

            async def receber() -> Message:
                nonlocal recebido
                mensagem = await request.receive()
                recebido += len(mensagem.get("body", b""))
                if recebido > limite:
                    raise _grande_demais(limite)
                return mensagem

            return await tratar(Request(request.scope, receber))

        return tratar_com_limite


@router.get("/conexoes", response_model=FontesDados)
def listar_fontes() -> FontesDados:
    return FontesDados(itens=[])


def enviar_csv(
    arquivo: Annotated[UploadFile, File(description="CSV do SAML-D sem as colunas de avaliação")],
    conn: Conexao,
    usuario: UsuarioAtual,
) -> Recibo:
    return ingestao.gravar_csv(conn, arquivo.file, arquivo.filename, usuario)


router.add_api_route(
    "/csv",
    enviar_csv,
    methods=["POST"],
    response_model=Recibo,
    status_code=status.HTTP_201_CREATED,
    responses={413: {"description": "Arquivo acima do limite de bytes ou de linhas"}},
    route_class_override=CorpoLimitado,
)


@router.post("/transacoes", response_model=Recibo, status_code=status.HTTP_201_CREATED)
def enviar_transacao(pedido: PedidoTransacao, conn: Conexao, usuario: UsuarioAtual) -> Recibo:
    return ingestao.gravar_transacao(conn, pedido, usuario)


@router.post("/conexoes", response_model=FonteDados, responses=_RESPOSTAS)
def registrar_fonte() -> FonteDados:
    raise _nao_implementada()


@router.post("/conexoes/{fonte_id}/sincronizar", response_model=FonteDados, responses=_RESPOSTAS)
def sincronizar_fonte(fonte_id: str) -> FonteDados:
    raise _nao_implementada()
