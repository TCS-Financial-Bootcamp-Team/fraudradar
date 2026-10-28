"""Contrato do monitoramento: espelha monitoramentoSchema em web/src/features/alertas/schemas."""

from datetime import date

from pydantic import BaseModel, Field


class Serie(BaseModel):
    nome: str
    valor: float = Field(ge=0)


class Indicadores(BaseModel):
    alertas: int
    revisados: int
    comunicados: int
    taxa_alerta: float = Field(ge=0, le=1)
    valor_sinalizado: float
    recall: float = Field(ge=0, le=1)
    acerto_tipologia: float = Field(ge=0, le=1)


class Monitoramento(BaseModel):
    semana: date
    indicadores: Indicadores
    semanas: list[Serie]
    tipologias: list[Serie]
    paises: list[Serie]
    taxa_paises: list[Serie]
    taxa_meios: list[Serie]
