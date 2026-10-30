"""Colunas do SAML-D e dtypes para carregá-lo de forma compacta com pandas.

Cabeçalho real do `SAML-D.csv`:
Time,Date,Sender_account,Receiver_account,Amount,Payment_currency,Received_currency,
Sender_bank_location,Receiver_bank_location,Payment_type,Is_laundering,Laundering_type
"""

CSV_COLUMNS: list[str] = [
    "Time",
    "Date",
    "Sender_account",
    "Receiver_account",
    "Amount",
    "Payment_currency",
    "Received_currency",
    "Sender_bank_location",
    "Receiver_bank_location",
    "Payment_type",
    "Is_laundering",
    "Laundering_type",
]

# Time e Date ficam como string e são combinadas em `occurred_at` na carga.
# Contas têm 10 dígitos: não cabem em int32. Valor fica em float64 (centavos).
CSV_DTYPES: dict[str, str] = {
    "Time": "string",
    "Date": "string",
    "Sender_account": "int64",
    "Receiver_account": "int64",
    "Amount": "float64",
    "Payment_currency": "category",
    "Received_currency": "category",
    "Sender_bank_location": "category",
    "Receiver_bank_location": "category",
    "Payment_type": "category",
    "Is_laundering": "int8",
    "Laundering_type": "category",
}

# Nome no CSV -> coluna nas tabelas `transactions` / `ground_truth`.
COLUMN_RENAMES: dict[str, str] = {
    "Sender_account": "sender",
    "Receiver_account": "receiver",
    "Amount": "amount",
    "Payment_currency": "payment_currency",
    "Received_currency": "received_currency",
    "Sender_bank_location": "sender_country",
    "Receiver_bank_location": "receiver_country",
    "Payment_type": "payment_type",
    "Is_laundering": "label",
    "Laundering_type": "original_typology",
}

# Amount está numa unidade só, qualquer que seja Payment_currency: a mediana fica entre
# 6,5 mil e 7,7 mil nas 13 moedas (em iene ou naira seria centenas de vezes maior). O artigo
# do SAML-D não diz qual é; adotamos libras porque o dataset é britânico (quase todas as
# transações são em "UK pounds"), como registra o dossiê do projeto.
AMOUNT_CURRENCY = "GBP"

# Rótulo e tipologia vão só para `ground_truth`. O modelo NUNCA lê estas colunas.
GROUND_TRUTH_COLUMNS: list[str] = ["Is_laundering", "Laundering_type"]

TRANSACTION_COLUMNS: list[str] = [c for c in CSV_COLUMNS if c not in GROUND_TRUTH_COLUMNS]
