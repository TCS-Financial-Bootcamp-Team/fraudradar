"""Replay da demonstração: libera para a fila a próxima semana já processada.

A API não roda o modelo (a imagem dela não tem lightgbm): o worker processa as semanas
antes (`docker compose run --rm worker lote --semana AAAA-MM-DD`) e o replay só as revela.
"""

from fastapi import APIRouter, HTTPException, status

from api.dependencias import Conexao, UsuarioAtual
from api.repositorios.semanas import liberar_proxima
from api.schemas.semanas import Replay

router = APIRouter(prefix="/replay", tags=["replay"])

SEM_SEMANA = (
    "Não há semana processada para liberar. Rode o worker: "
    "docker compose run --rm worker lote --semana AAAA-MM-DD"
)


@router.post("/proxima-semana", response_model=Replay, responses={409: {"description": SEM_SEMANA}})
def proxima_semana(conn: Conexao, usuario: UsuarioAtual) -> Replay:
    liberada = liberar_proxima(conn, usuario)
    if liberada is None:
        raise HTTPException(status.HTTP_409_CONFLICT, SEM_SEMANA)
    semana, alertas = liberada
    return Replay(semana=semana, alertas_gerados=alertas)
