"""Colunas do SAML-D e dtypes para carregá-lo de forma compacta com pandas.

Cabeçalho real do `SAML-D.csv`:
Time,Date,Sender_account,Receiver_account,Amount,Payment_currency,Received_currency,
Sender_bank_location,Receiver_bank_location,Payment_type,Is_laundering,Laundering_type
"""

COLUNAS_CSV: list[str] = [
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

# Time e Date ficam como string e são combinadas em `data_hora` na carga.
# Contas têm 10 dígitos: não cabem em int32. Valor fica em float64 (centavos).
DTYPES_CSV: dict[str, str] = {
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

# Nome no CSV -> coluna nas tabelas `transacoes` / `avaliacao`.
RENOMEAR: dict[str, str] = {
    "Sender_account": "remetente",
    "Receiver_account": "recebedor",
    "Amount": "valor",
    "Payment_currency": "moeda_pagamento",
    "Received_currency": "moeda_recebida",
    "Sender_bank_location": "pais_remetente",
    "Receiver_bank_location": "pais_recebedor",
    "Payment_type": "tipo_pagamento",
    "Is_laundering": "rotulo",
    "Laundering_type": "tipologia_original",
}

# Amount está numa unidade só, qualquer que seja Payment_currency: a mediana fica entre
# 6,5 mil e 7,7 mil nas 13 moedas (em iene ou naira seria centenas de vezes maior). O artigo
# do SAML-D não diz qual é; adotamos libras porque o dataset é britânico (quase todas as
# transações são em "UK pounds"), como registra o dossiê do projeto.
MOEDA_DOS_VALORES = "GBP"

# Rótulo e tipologia vão só para `avaliacao`. O modelo NUNCA lê estas colunas.
COLUNAS_AVALIACAO: list[str] = ["Is_laundering", "Laundering_type"]

COLUNAS_TRANSACAO: list[str] = [c for c in COLUNAS_CSV if c not in COLUNAS_AVALIACAO]
