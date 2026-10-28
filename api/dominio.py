"""Tradução entre o banco e o contrato do front, compartilhada pelas rotas de alertas."""

from datetime import date, timedelta
from typing import Annotated

from fastapi import HTTPException, Path, status
from sqlalchemy import Connection, RowMapping, text

from api.schemas.alertas import Alerta, StatusAlerta, TipoDecisao

# Banco -> front. O front não distingue "novo" de "em_analise": os dois são pendentes.
STATUS_PARA_FRONT: dict[str, StatusAlerta] = {
    "novo": "pendente",
    "em_analise": "pendente",
    "aprofundado": "aprofundar",
    "arquivado": "arquivado",
    "comunicado": "comunicar",
}
# Front -> banco, para filtrar a fila.
STATUS_DO_FRONT: dict[StatusAlerta, tuple[str, ...]] = {
    "pendente": ("novo", "em_analise"),
    "aprofundar": ("aprofundado",),
    "arquivado": ("arquivado",),
    "comunicar": ("comunicado",),
}
# Decisão do analista -> status do alerta no banco.
STATUS_DA_DECISAO: dict[TipoDecisao, str] = {
    "arquivar": "arquivado",
    "aprofundar": "aprofundado",
    "comunicar": "comunicado",
}

TIPOLOGIA_INDEFINIDA = "Indefinida"
PAIS_INDEFINIDO = "Indefinido"

AlertaId = Annotated[int, Path(ge=1, le=2**63 - 1, description="id numérico do alerta")]

# Colunas que alerta_de_linha espera, com a tabela alertas apelidada de `a`.
COLUNAS_ALERTA = (
    "a.id, a.conta, a.semana, a.score, a.status, a.paises, a.tipologia,"
    " a.valor_total, a.qtd_transacoes"
)


def segunda_feira(dia: date) -> date:
    """Semana é sempre identificada pela segunda-feira."""
    return dia - timedelta(days=dia.weekday())


def alerta_de_linha(linha: RowMapping) -> Alerta:
    """Linha com COLUNAS_ALERTA -> contrato do front (score de 0-1 para 0-100)."""
    return Alerta(
        id=str(linha["id"]),
        conta=str(linha["conta"]),
        semana=linha["semana"],
        pais=linha["paises"][0] if linha["paises"] else PAIS_INDEFINIDO,
        tipologia=linha["tipologia"] or TIPOLOGIA_INDEFINIDA,
        score=round(float(linha["score"]) * 100, 1),
        valor=float(linha["valor_total"]),
        transacoes=linha["qtd_transacoes"],
        status=STATUS_PARA_FRONT[linha["status"]],
    )


def linha_do_alerta(
    conn: Connection, alerta_id: int, *, para_atualizar: bool = False
) -> RowMapping:
    """Linha do alerta com COLUNAS_ALERTA, ou 404.

    `para_atualizar` trava a linha (FOR UPDATE) até o fim da transação da requisição.
    """
    sql = f"SELECT {COLUNAS_ALERTA} FROM alertas a WHERE a.id = :id"
    if para_atualizar:
        sql += " FOR UPDATE"
    linha = conn.execute(text(sql), {"id": alerta_id}).mappings().first()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Alerta {alerta_id} não encontrado.")
    return linha
