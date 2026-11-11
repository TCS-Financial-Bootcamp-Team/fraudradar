"""Leitura do dado de treino de um conjunto de dados: as transações que têm gabarito e o gabarito.

Usa o schema que estiver em uso na conexão (``fraudradar.datasets.use_dataset``). Lê por COPY,
passando por um arquivo temporário para não guardar o texto inteiro na memória (o SAML-D
inteiro tem ~1 GB em CSV). Os tipos são os de ``fraudradar.data.saml_d.load_csv``, para as
variáveis saírem iguais às do treino pelo CSV. O gabarito só treina e mede o modelo.
"""

import tempfile

import pandas as pd
from psycopg import sql
from sqlalchemy import Connection, text

from fraudradar.data.saml_d import TRANSACTION_COLUMNS

_TEXT_COLUMNS = [
    "payment_currency",
    "received_currency",
    "sender_country",
    "receiver_country",
    "payment_type",
]
_TRANSACTION_DTYPES = {
    "id": "int64",
    "sender": "int64",
    "receiver": "int64",
    "amount": "float64",
    **dict.fromkeys(_TEXT_COLUMNS, "category"),
}
_TRUTH_COLUMNS = ["transaction_id", "label", "typology"]


def _copy_csv(conn: Connection, query: sql.Composable, names: list[str], dtypes: dict):
    with tempfile.TemporaryFile() as buffer:
        with conn.connection.driver_connection.cursor() as cursor, cursor.copy(query) as copy:
            for chunk in copy:
                buffer.write(chunk)
        buffer.seek(0)
        # "NA" pode ser texto (país, moeda): nada vira nulo na leitura.
        return pd.read_csv(buffer, names=names, dtype=dtypes, keep_default_na=False)


def read_labeled(conn: Connection) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(transações, gabarito) das transações rotuladas, com as colunas de ``load_csv``.

    Transação sem gabarito fica de fora: o treino só vê o que consegue medir.
    """
    conn.execute(text("SET LOCAL DateStyle = 'ISO'"))
    transactions = _copy_csv(
        conn,
        sql.SQL(
            "COPY (SELECT {columns} FROM transactions t "
            "WHERE EXISTS (SELECT 1 FROM ground_truth g WHERE g.transaction_id = t.id) "
            "ORDER BY t.id) TO STDOUT WITH (FORMAT csv)"
        ).format(
            columns=sql.SQL(", ").join(
                sql.SQL("t.") + sql.Identifier(c) for c in TRANSACTION_COLUMNS
            )
        ),
        TRANSACTION_COLUMNS,
        _TRANSACTION_DTYPES,
    )
    transactions["occurred_at"] = pd.to_datetime(transactions["occurred_at"], format="ISO8601")
    ground_truth = _copy_csv(
        conn,
        sql.SQL(
            "COPY (SELECT {columns} FROM ground_truth ORDER BY transaction_id) TO STDOUT"
        ).format(columns=sql.SQL(", ").join(map(sql.Identifier, _TRUTH_COLUMNS)))
        + sql.SQL(" WITH (FORMAT csv)"),
        _TRUTH_COLUMNS,
        {"transaction_id": "int64", "label": "int8", "typology": "category"},
    )
    return transactions, ground_truth
