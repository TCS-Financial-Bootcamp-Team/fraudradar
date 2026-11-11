"""Contrato da ingestão: espelha web/src/features/ingestion/schemas/ingestion.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class TransactionRequest(BaseModel):
    """transactionSchema: as colunas de TRANSACTION_COLUMNS, com os nomes do CSV.

    O zod é `.strict()`: campo a mais (como Is_laundering) é recusado. Aqui fica só o formato
    do JSON; as regras de cada campo são as de fraudradar.data.ingestion, as mesmas do CSV.
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


class Receipt(BaseModel):
    id: str
    status: Literal["received", "processing", "completed"]
    message: str
