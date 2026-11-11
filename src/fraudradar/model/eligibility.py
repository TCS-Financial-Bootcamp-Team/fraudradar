"""Quando um conjunto de dados pode ser retreinado.

Sem LightGBM: a API (imagem só com o grupo `api`) e o worker usam a mesma regra. Lê o schema
que estiver em uso na conexão (`fraudradar.datasets.use_dataset`).
"""

from sqlalchemy import Connection, text

from fraudradar.model import MIN_LABELED_WEEKS


def training_block_reason(conn: Connection) -> str | None:
    """Por que o conjunto não pode ser retreinado, em português; ``None`` quando pode.

    Retreino só com gabarito: precisa de transações rotuladas em semanas suficientes para a
    divisão no tempo (treino, validação e teste) e de pelo menos uma lavagem.
    """
    has_truth = conn.execute(text("SELECT EXISTS (SELECT 1 FROM ground_truth)")).scalar_one()
    if not has_truth:
        return "Este conjunto não tem gabarito: o retreino só é possível com transações rotuladas."
    row = conn.execute(
        text(
            "SELECT count(DISTINCT date_trunc('week', t.occurred_at)) AS weeks, "
            "coalesce(bool_or(g.label = 1), false) AS has_laundering "
            "FROM ground_truth g JOIN transactions t ON t.id = g.transaction_id"
        )
    ).one()
    if row.weeks < MIN_LABELED_WEEKS:
        return (
            f"O gabarito cobre só {row.weeks} semana(s); o retreino precisa de pelo menos "
            f"{MIN_LABELED_WEEKS} semanas rotuladas."
        )
    if not row.has_laundering:
        return "O gabarito não tem nenhuma lavagem marcada; não há o que o modelo aprender."
    return None
