"""Contrato da ingestão: espelha web/src/features/ingestao/schemas/ingestao.ts."""

from typing import Literal

from pydantic import BaseModel


class FonteDados(BaseModel):
    id: str
    nome: str
    tipo: Literal["postgres"]
    host_mascarado: str
    banco_mascarado: str
    status: Literal["conectada", "sincronizando", "erro"]
    ultima_sincronizacao: str | None


class FontesDados(BaseModel):
    itens: list[FonteDados]


class Recibo(BaseModel):
    id: str
    status: Literal["recebido", "processando", "concluido"]
    mensagem: str
