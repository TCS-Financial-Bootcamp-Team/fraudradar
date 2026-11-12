"""Leitura do dado de treino de um conjunto de dados: as transações que têm gabarito e o gabarito,
e o retorno dos analistas (``analyst_labels``) já levado da conta na semana às transações.

Usa o schema que estiver em uso na conexão (``fraudradar.datasets.use_dataset``). Lê por COPY,
passando por um arquivo temporário para não guardar o texto inteiro na memória (o SAML-D
inteiro tem ~1 GB em CSV). Os tipos são os de ``fraudradar.data.saml_d.load_csv``, para as
variáveis saírem iguais às do treino pelo CSV. O gabarito só treina e mede o modelo.
"""

import tempfile
from collections.abc import Sequence
from datetime import date

import numpy as np
import pandas as pd
from psycopg import sql
from sqlalchemy import Connection, text

from fraudradar.data.saml_d import TRANSACTION_COLUMNS
from fraudradar.features.history import with_cash_account
from fraudradar.model import FEEDBACK_POSITIVE_TOP

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


def read_transactions(conn: Connection, ids: Sequence[int]) -> pd.DataFrame:
    """Transações pelo id, com as colunas e os tipos de ``read_labeled`` (poucas linhas: as que
    o retorno dos analistas cobre e que não têm gabarito)."""
    rows = conn.execute(
        text(
            f"SELECT {', '.join(TRANSACTION_COLUMNS)} FROM transactions"
            " WHERE id = ANY(CAST(:ids AS bigint[])) ORDER BY id"
        ),
        {"ids": [int(i) for i in ids]},
    ).all()
    frame = pd.DataFrame([tuple(r) for r in rows], columns=TRANSACTION_COLUMNS)
    frame["occurred_at"] = pd.to_datetime(frame["occurred_at"])
    return frame.astype(_TRANSACTION_DTYPES)


# --- retorno dos analistas -------------------------------------------------------------------

FEEDBACK_LABEL_COLUMNS = ["alert_id", "account", "week", "label", "origin", "source"]


def read_feedback(conn: Connection, *, before: date, include_simulated: bool) -> pd.DataFrame:
    """Os rótulos do retorno dos analistas das semanas fechadas (anteriores a ``before``, o
    período aberto), um por alerta: ``alert_id, account, week, label, origin, source``.

    Os do analista simulado só entram com ``include_simulated``.
    """
    rows = conn.execute(
        text(
            "SELECT alert_id, account, week, label, origin, source FROM analyst_labels"
            " WHERE week < :before AND (source = 'analyst' OR :simulated)"
            " ORDER BY week, alert_id"
        ),
        {"before": before, "simulated": include_simulated},
    ).all()
    frame = pd.DataFrame([tuple(r) for r in rows], columns=FEEDBACK_LABEL_COLUMNS)
    frame["week"] = pd.to_datetime(frame["week"])
    return frame.astype({"alert_id": "int64", "account": "int64", "label": "int8"})


FEEDBACK_CANDIDATE_COLUMNS = [
    "alert_id",
    "transaction_id",
    "sender",
    "receiver",
    "payment_type",
    "score",
    "has_truth",
]


def read_feedback_candidates(conn: Connection, alert_ids: Sequence[int]) -> pd.DataFrame:
    """As transações de cada conta rotulada na semana do rótulo, enviadas ou recebidas, como o
    analista viu nas movimentações do alerta: ``alert_id, transaction_id, sender, receiver,
    payment_type``, a nota que o modelo do alerta deu (``score``, de ``transaction_scores``) e se
    a transação tem gabarito (``has_truth``; o valor do gabarito não sai daqui).

    Transação de simulação (``ingestions.source = 'simulation'``) nunca entra: é inventada para a
    demonstração. Quem decide quais destas viram rótulo é ``feedback_transactions``.
    """
    if not len(alert_ids):
        return pd.DataFrame(columns=FEEDBACK_CANDIDATE_COLUMNS)
    rows = conn.execute(
        text(
            """
            WITH labeled AS (
                SELECT l.alert_id, l.account, CAST(l.week AS timestamp) AS start, a.model_version
                FROM analyst_labels l JOIN alerts a ON a.id = l.alert_id
                WHERE l.alert_id = ANY(CAST(:alerts AS bigint[]))
            ), touched AS (
                SELECT l.alert_id, t.id FROM labeled l JOIN transactions t
                  ON t.sender = l.account
                 AND t.occurred_at >= l.start AND t.occurred_at < l.start + INTERVAL '7 days'
                UNION
                SELECT l.alert_id, t.id FROM labeled l JOIN transactions t
                  ON t.receiver = l.account
                 AND t.occurred_at >= l.start AND t.occurred_at < l.start + INTERVAL '7 days'
            )
            SELECT x.alert_id, t.id AS transaction_id, t.sender, t.receiver, t.payment_type,
                   s.score,
                   EXISTS (SELECT 1 FROM ground_truth g WHERE g.transaction_id = t.id) AS has_truth
            FROM touched x
            JOIN labeled l ON l.alert_id = x.alert_id
            JOIN transactions t ON t.id = x.id
            LEFT JOIN ingestions i ON i.id = t.ingestion_id
            LEFT JOIN transaction_scores s
                   ON s.transaction_id = t.id AND s.model_version = l.model_version
            WHERE i.source IS DISTINCT FROM 'simulation'
            ORDER BY x.alert_id, t.id
            """
        ),
        {"alerts": [int(a) for a in alert_ids]},
    ).all()
    frame = pd.DataFrame([tuple(r) for r in rows], columns=FEEDBACK_CANDIDATE_COLUMNS)
    return frame.astype(
        {
            "alert_id": "int64",
            "transaction_id": "int64",
            "sender": "int64",
            "receiver": "int64",
            "score": "float64",
            "has_truth": "bool",
        }
    )


def feedback_transactions(
    labels: pd.DataFrame, candidates: pd.DataFrame, top: int = FEEDBACK_POSITIVE_TOP
) -> pd.DataFrame:
    """O rótulo da conta na semana levado às transações dela: ``transaction_id, label,
    has_truth``, uma linha por transação.

    - falso positivo confirmado (0): todas as transações da conta na semana, enviadas ou
      recebidas; se a conta-semana é inocente, nenhuma delas é lavagem;
    - lavagem confirmada (1): as ``top`` transações da conta na semana de maior nota do modelo,
      as que o analista viu como evidência (uma conta lavadora também faz transação normal).

    As contas são vistas como pelo modelo: no depósito e no saque em espécie, o outro lado é o
    CAIXA (``with_cash_account``), então a conta só cobre a transação pelo lado dela. Transação
    coberta por dois rótulos que discordam (as duas contas dela rotuladas) fica com lavagem
    confirmada: é o rótulo que viu a transação como evidência.
    """
    if candidates.empty or labels.empty:
        return pd.DataFrame(
            {
                "transaction_id": pd.Series(dtype="int64"),
                "label": pd.Series(dtype="int8"),
                "has_truth": pd.Series(dtype="bool"),
            }
        )
    by_alert = labels.set_index("alert_id")
    account = by_alert["account"].reindex(candidates["alert_id"]).to_numpy()
    cash = with_cash_account(candidates[["sender", "receiver", "payment_type"]])
    own_side = (cash["sender"].to_numpy() == account) | (cash["receiver"].to_numpy() == account)
    rows = candidates[own_side].assign(
        label=by_alert["label"].reindex(candidates.loc[own_side, "alert_id"]).to_numpy()
    )
    negatives = rows[rows["label"] == 0]
    positives = (
        rows[rows["label"] == 1]
        .sort_values(
            ["alert_id", "score", "transaction_id"],
            ascending=[True, False, True],
            na_position="last",
        )
        .groupby("alert_id")
        .head(top)
    )
    mapped = pd.concat([negatives, positives], ignore_index=True)
    per_transaction = mapped.groupby("transaction_id", as_index=False).agg(
        label=("label", "max"), has_truth=("has_truth", "first")
    )
    return per_transaction.astype({"transaction_id": "int64", "label": "int8", "has_truth": "bool"})


def label_weeks(labels: pd.DataFrame) -> np.ndarray:
    """As semanas (segundas) dos rótulos, sem repetir, em ordem."""
    return np.sort(labels["week"].unique())
