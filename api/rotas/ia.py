"""Parecer e assistente (LLM com RAG). A cadeia vai viver em fraudradar.ia (frente 3).

Enquanto ela não existe, as rotas validam o pedido, conferem o alerta e respondem 503.
O LLM nunca recebe números de conta: pseudonimize antes do prompt.
"""

from fastapi import APIRouter, HTTPException, status

from api.dependencias import Conexao
from api.dominio import AlertaId, linha_do_alerta
from api.schemas.alertas import Parecer
from api.schemas.chat import PedidoChat, RespostaChat

router = APIRouter(tags=["ia"])

IA_INDISPONIVEL = "O assistente de IA ainda não está disponível nesta versão da API."
_RESPOSTAS = {503: {"description": IA_INDISPONIVEL}}


def _indisponivel() -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, IA_INDISPONIVEL)


@router.post("/alertas/{alerta_id}/parecer", response_model=Parecer, responses=_RESPOSTAS)
def gerar_parecer(alerta_id: AlertaId, conn: Conexao) -> Parecer:
    """Gera o parecer do alerta com RAG e grava em `pareceres`."""
    linha_do_alerta(conn, alerta_id)
    raise _indisponivel()


@router.post("/alertas/{alerta_id}/chat", response_model=RespostaChat, responses=_RESPOSTAS)
def conversar_sobre_alerta(alerta_id: AlertaId, pedido: PedidoChat, conn: Conexao) -> RespostaChat:
    """Pergunta do analista ao agente, com o alerta como contexto."""
    linha_do_alerta(conn, alerta_id)
    raise _indisponivel()


@router.post("/chat", response_model=RespostaChat, responses=_RESPOSTAS)
def conversar(pedido: PedidoChat) -> RespostaChat:
    """Pergunta geral do analista ao agente (fora de um alerta)."""
    raise _indisponivel()
