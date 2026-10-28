"""Ingestão de transações: CSV no formato SAML-D, transação avulsa e fontes Postgres.

Ainda não implementada: a listagem de fontes responde vazia e os envios respondem 501.
"""

from fastapi import APIRouter, HTTPException, status

from api.schemas.ingestao import FonteDados, FontesDados, Recibo

router = APIRouter(prefix="/ingestao", tags=["ingestao"])

NAO_IMPLEMENTADA = "A ingestão ainda não está disponível nesta versão da API."
_RESPOSTAS = {501: {"description": NAO_IMPLEMENTADA}}


def _nao_implementada() -> HTTPException:
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, NAO_IMPLEMENTADA)


@router.get("/conexoes", response_model=FontesDados)
def listar_fontes() -> FontesDados:
    return FontesDados(itens=[])


@router.post("/csv", response_model=Recibo, responses=_RESPOSTAS)
def enviar_csv() -> Recibo:
    raise _nao_implementada()


@router.post("/transacoes", response_model=Recibo, responses=_RESPOSTAS)
def enviar_transacao() -> Recibo:
    raise _nao_implementada()


@router.post("/conexoes", response_model=FonteDados, responses=_RESPOSTAS)
def registrar_fonte() -> FonteDados:
    raise _nao_implementada()


@router.post("/conexoes/{fonte_id}/sincronizar", response_model=FonteDados, responses=_RESPOSTAS)
def sincronizar_fonte(fonte_id: str) -> FonteDados:
    raise _nao_implementada()
