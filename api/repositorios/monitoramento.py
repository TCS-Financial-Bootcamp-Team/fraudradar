"""Números do monitoramento de uma semana.

O que muda com o trabalho do analista (revisados, comunicados) é contado em `alertas`;
a avaliação contra o gabarito (recall, acerto, taxas) vem pronta do worker em
`lotes_semana.metricas`: a API nunca lê `avaliacao`.
"""

import math
from datetime import date

from sqlalchemy import Connection, RowMapping, text

from api.dominio import PAIS_INDEFINIDO, STATUS_DO_FRONT, TIPOLOGIA_INDEFINIDA

SEMANAS_NA_SERIE = 12
_MESES = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")


def proporcao(valor: object) -> float:
    """Número entre 0 e 1 vindo do JSON do worker; qualquer outra coisa vira 0."""
    if isinstance(valor, bool) or not isinstance(valor, int | float) or not math.isfinite(valor):
        return 0.0
    return min(max(float(valor), 0.0), 1.0)


def rotulo_semana(semana: date) -> str:
    return f"{semana.day:02d} {_MESES[semana.month - 1]}"


def contagens(conn: Connection, semana: date) -> RowMapping:
    sql = """
        SELECT count(*) AS alertas,
               count(*) FILTER (WHERE a.status <> ALL(:pendentes)) AS revisados,
               count(*) FILTER (WHERE c.alerta_id IS NOT NULL) AS comunicados,
               COALESCE(sum(a.valor_total), 0) AS valor_sinalizado
        FROM alertas a
        LEFT JOIN (SELECT DISTINCT alerta_id FROM comunicacoes WHERE status = 'aprovada') c
               ON c.alerta_id = a.id
        WHERE a.semana = :semana
    """
    pendentes = list(STATUS_DO_FRONT["pendente"])
    return conn.execute(text(sql), {"semana": semana, "pendentes": pendentes}).mappings().one()


def lote(conn: Connection, semana: date) -> RowMapping | None:
    sql = "SELECT contas_ativas, metricas FROM lotes_semana WHERE semana = :semana"
    return conn.execute(text(sql), {"semana": semana}).mappings().first()


def alertas_por_semana(conn: Connection, semana: date) -> list[RowMapping]:
    """As últimas semanas processadas até `semana`, em ordem cronológica."""
    sql = """
        SELECT l.semana, count(a.id) AS alertas
        FROM lotes_semana l
        LEFT JOIN alertas a ON a.semana = l.semana
        WHERE l.semana <= :semana
        GROUP BY l.semana
        ORDER BY l.semana DESC
        LIMIT :limite
    """
    linhas = conn.execute(text(sql), {"semana": semana, "limite": SEMANAS_NA_SERIE}).mappings()
    return list(reversed(list(linhas)))


def distribuicao(conn: Connection, semana: date, por: str) -> list[RowMapping]:
    """Alertas da semana por tipologia prevista ou por país principal."""
    expressoes = {
        "tipologia": "COALESCE(a.tipologia, :indefinido)",
        "pais": "COALESCE(a.paises[1], :indefinido)",
    }
    indefinido = TIPOLOGIA_INDEFINIDA if por == "tipologia" else PAIS_INDEFINIDO
    sql = f"""
        SELECT {expressoes[por]} AS nome, count(*) AS valor
        FROM alertas a
        WHERE a.semana = :semana
        GROUP BY 1
        ORDER BY valor DESC, nome
    """
    return list(conn.execute(text(sql), {"semana": semana, "indefinido": indefinido}).mappings())
