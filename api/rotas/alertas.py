"""Fila de alertas da semana, detalhe com evidências e grafo de 2 saltos.

- GET /alertas?semana=&status=&pais=&pagina=&tamanho=&ordenar=  — fila paginada da semana
- GET /alertas/{id}                                              — detalhe + evidências
- GET /alertas/{id}/grafo                                        — grafo de 2 saltos (Cytoscape)

Decisão e comunicação ficam em decisoes.py; parecer e chat em ia.py.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from api.dependencias import Conexao
from api.dominio import AlertaId, alerta_de_linha, linha_do_alerta, segunda_feira
from api.repositorios import fila
from api.schemas.alertas import Detalhe, Fila, Grafo, StatusAlerta

router = APIRouter(prefix="/alertas", tags=["alertas"])


@router.get("", response_model=Fila)
def listar_alertas(
    conn: Conexao,
    semana: date,
    status: StatusAlerta | None = None,
    pais: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    pagina: Annotated[int, Query(ge=1, le=10_000)] = 1,  # sem teto, OFFSET estoura o bigint
    tamanho: Annotated[int, Query(ge=1, le=100)] = 10,
    ordenar: fila.Ordem = "score_desc",
) -> Fila:
    """Fila paginada da semana; `paises` traz todas as opções da semana, sem os filtros."""
    semana = segunda_feira(semana)
    linhas, total = fila.listar_fila(
        conn, semana, status=status, pais=pais, pagina=pagina, tamanho=tamanho, ordenar=ordenar
    )
    return Fila(
        itens=[alerta_de_linha(linha) for linha in linhas],
        total=total,
        paises=fila.paises_da_semana(conn, semana),
    )


@router.get("/{alerta_id}", response_model=Detalhe)
def detalhar_alerta(alerta_id: AlertaId, conn: Conexao) -> Detalhe:
    """Alerta com evidências: contribuições, regras, movimentações e último parecer."""
    linha = linha_do_alerta(conn, alerta_id)
    return Detalhe(
        **alerta_de_linha(linha).model_dump(),
        contribuicoes=fila.contribuicoes_do_alerta(conn, alerta_id),
        regras=fila.regras_do_alerta(conn, alerta_id),
        movimentacoes=fila.movimentacoes_da_conta(conn, linha["conta"], linha["semana"]),
        parecer=fila.parecer_mais_recente(conn, alerta_id),
    )


@router.get("/{alerta_id}/grafo", response_model=Grafo)
def grafo_do_alerta(alerta_id: AlertaId, conn: Conexao) -> Grafo:
    """Vizinhança de até 2 saltos da conta na semana do alerta."""
    linha = linha_do_alerta(conn, alerta_id)
    nos, arestas = fila.grafo_de_2_saltos(conn, linha["conta"], linha["semana"])
    return Grafo(nos=nos, arestas=arestas)
