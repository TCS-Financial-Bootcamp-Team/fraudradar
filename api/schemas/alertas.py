"""Contrato de alertas com o front: espelha web/src/features/alertas/schemas/alertas.ts.

Mudou aqui, mude lá (e vice-versa). Ids e contas saem como texto; score sai de 0 a 100.
"""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

StatusAlerta = Literal["pendente", "aprofundar", "arquivado", "comunicar"]
TipoDecisao = Literal["arquivar", "aprofundar", "comunicar"]


class Alerta(BaseModel):
    id: str
    conta: str
    semana: date
    pais: str
    tipologia: str
    score: float = Field(ge=0, le=100)
    valor: float = Field(ge=0)
    transacoes: int = Field(ge=0)
    status: StatusAlerta


class Fila(BaseModel):
    itens: list[Alerta]
    total: int = Field(ge=0)
    paises: list[str]


class Fonte(BaseModel):
    titulo: str
    trecho: str


class Parecer(BaseModel):
    texto: str
    fontes: list[Fonte]


class Contribuicao(BaseModel):
    nome: str
    valor: float = Field(ge=0, le=100)


class Regra(BaseModel):
    codigo: str
    descricao: str


class Movimentacao(BaseModel):
    id: str
    data: str
    origem: str
    destino: str
    valor: float
    moeda: str  # código ISO da moeda de `valor` (o front formata com Intl): sempre GBP no SAML-D
    meio: str
    moeda_pagamento: str  # rótulo do SAML-D ("Naira"); a mais no contrato, o zod do front descarta


class Detalhe(Alerta):
    contribuicoes: list[Contribuicao]
    regras: list[Regra]
    movimentacoes: list[Movimentacao]
    parecer: Parecer | None


class No(BaseModel):
    id: str
    rotulo: str
    central: bool


class Aresta(BaseModel):
    id: str
    origem: str
    destino: str
    valor: float


class Grafo(BaseModel):
    nos: list[No]
    arestas: list[Aresta]


class PedidoDecisao(BaseModel):
    decisao: TipoDecisao
    justificativa: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=4000)
    ]


class Comunicacao(BaseModel):
    alerta_id: str
    texto: str
    status: Literal["rascunho", "aprovada"]
    atualizado_em: datetime


class PedidoAprovacao(BaseModel):
    texto: Annotated[str, StringConstraints(strip_whitespace=True, min_length=30, max_length=20000)]
