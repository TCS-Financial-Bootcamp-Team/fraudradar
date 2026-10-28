"""Monitoramento da fila e do modelo numa semana (dashboard e tela de monitoramento)."""

from datetime import date

from fastapi import APIRouter

from api.dependencias import Conexao
from api.dominio import segunda_feira
from api.repositorios import monitoramento as repo
from api.schemas.monitoramento import Indicadores, Monitoramento, Serie

router = APIRouter(tags=["monitoramento"])


def _taxas(mapa: object) -> list[Serie]:
    """{"UK": 0.01, ...} do worker -> séries da maior para a menor; ignora o que não é número."""
    if not isinstance(mapa, dict):
        return []
    series = [
        Serie(nome=str(nome), valor=repo.proporcao(valor))
        for nome, valor in mapa.items()
        if isinstance(valor, int | float) and not isinstance(valor, bool)
    ]
    return sorted(series, key=lambda s: (-s.valor, s.nome))


@router.get("/monitoramento", response_model=Monitoramento)
def monitoramento(semana: date, conn: Conexao) -> Monitoramento:
    semana = segunda_feira(semana)
    contagem = repo.contagens(conn, semana)
    lote = repo.lote(conn, semana)
    metricas = lote["metricas"] if lote else {}
    contas_ativas = lote["contas_ativas"] if lote else 0
    taxa_alerta = contagem["alertas"] / contas_ativas if contas_ativas else 0.0
    return Monitoramento(
        semana=semana,
        indicadores=Indicadores(
            alertas=contagem["alertas"],
            revisados=contagem["revisados"],
            comunicados=contagem["comunicados"],
            taxa_alerta=repo.proporcao(taxa_alerta),
            valor_sinalizado=float(contagem["valor_sinalizado"]),
            recall=repo.proporcao(metricas.get("recall")),
            acerto_tipologia=repo.proporcao(metricas.get("acerto_tipologia")),
        ),
        semanas=[
            Serie(nome=repo.rotulo_semana(linha["semana"]), valor=linha["alertas"])
            for linha in repo.alertas_por_semana(conn, semana)
        ],
        tipologias=[Serie(**linha) for linha in repo.distribuicao(conn, semana, "tipologia")],
        paises=[Serie(**linha) for linha in repo.distribuicao(conn, semana, "pais")],
        taxa_paises=_taxas(metricas.get("taxa_paises")),
        taxa_meios=_taxas(metricas.get("taxa_meios")),
    )
