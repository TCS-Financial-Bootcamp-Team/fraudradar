"""Semanas já liberadas pelo replay, com a contagem de alertas de cada uma."""

from fastapi import APIRouter

from api.dependencias import Conexao
from api.repositorios.semanas import semanas_liberadas
from api.schemas.semanas import SemanaProcessada, Semanas

router = APIRouter(tags=["semanas"])


@router.get("/semanas", response_model=Semanas)
def listar_semanas(conn: Conexao) -> Semanas:
    """`atual` é a semana liberada mais recente: o ponto de partida do front."""
    itens = [SemanaProcessada(**linha) for linha in semanas_liberadas(conn)]
    return Semanas(atual=itens[0].semana if itens else None, itens=itens)
