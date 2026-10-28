"""Decisão do analista sobre o alerta e comunicação ao COAF.

- POST /alertas/{id}/decisao              — arquivar/aprofundar/comunicar + justificativa
- GET  /alertas/{id}/comunicacao          — rascunho (ou versão aprovada) da comunicação
- POST /alertas/{id}/comunicacao/aprovar  — aprova o rascunho com o nome do analista
"""

from fastapi import APIRouter

from api.dependencias import Conexao, UsuarioAtual
from api.dominio import AlertaId
from api.repositorios import decisoes
from api.schemas.alertas import Alerta, Comunicacao, PedidoAprovacao, PedidoDecisao

router = APIRouter(prefix="/alertas", tags=["decisoes"])


@router.post("/{alerta_id}/decisao", response_model=Alerta)
def registrar_decisao(
    alerta_id: AlertaId, pedido: PedidoDecisao, conn: Conexao, usuario: UsuarioAtual
) -> Alerta:
    return decisoes.registrar_decisao(conn, alerta_id, pedido, usuario)


@router.get("/{alerta_id}/comunicacao", response_model=Comunicacao)
def obter_comunicacao(alerta_id: AlertaId, conn: Conexao) -> Comunicacao:
    return decisoes.obter_comunicacao(conn, alerta_id)


@router.post("/{alerta_id}/comunicacao/aprovar", response_model=Comunicacao)
def aprovar_comunicacao(
    alerta_id: AlertaId, pedido: PedidoAprovacao, conn: Conexao, usuario: UsuarioAtual
) -> Comunicacao:
    return decisoes.aprovar_comunicacao(conn, alerta_id, pedido, usuario)
