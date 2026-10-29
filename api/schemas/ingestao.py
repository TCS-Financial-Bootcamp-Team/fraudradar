"""Contrato da ingestão: espelha web/src/features/ingestao/schemas/ingestao.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class PedidoTransacao(BaseModel):
    """transacaoSchema: as colunas de COLUNAS_TRANSACAO, com os nomes do CSV.

    O zod é `.strict()`: campo a mais (como Is_laundering) é recusado. Aqui fica só o formato
    do JSON; as regras de cada campo são as de fraudradar.dados.ingestao, as mesmas do CSV.
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    Time: str
    Date: str
    Sender_account: str
    Receiver_account: str
    Amount: float
    Payment_currency: str
    Received_currency: str
    Sender_bank_location: str
    Receiver_bank_location: str
    Payment_type: str


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
