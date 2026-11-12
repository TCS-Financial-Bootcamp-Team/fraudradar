"""Quando um conjunto de dados pode ser retreinado.

Sem LightGBM e sem tocar em ``ground_truth``: a API (imagem só com o grupo `api`) lê só o
registro ``public.datasets``, onde o worker guarda ``labeled_weeks`` e ``has_laundering``
(``worker/labels.py`` calcula depois de ``load``, de uma importação com gabarito e de cada
treino). O worker usa a mesma regra de texto, ``block_reason``, sobre o valor que acabou de medir.
"""

from sqlalchemy import Connection, text

from fraudradar.model import MIN_LABELED_WEEKS


def block_reason(labeled_weeks: int, has_laundering: bool) -> str | None:
    """Por que o conjunto não pode ser retreinado, em português; ``None`` quando pode.

    Retreino só com gabarito: precisa de transações rotuladas em semanas suficientes para a
    divisão no tempo (treino, validação e teste) e de pelo menos uma lavagem.
    """
    if labeled_weeks <= 0:
        return "Este conjunto não tem gabarito: o retreino só é possível com transações rotuladas."
    if labeled_weeks < MIN_LABELED_WEEKS:
        return (
            f"O gabarito cobre só {labeled_weeks} semana(s); o retreino precisa de pelo menos "
            f"{MIN_LABELED_WEEKS} semanas rotuladas."
        )
    if not has_laundering:
        return "O gabarito não tem nenhuma lavagem marcada; não há o que o modelo aprender."
    return None


def training_block_reason(conn: Connection, slug: str) -> str | None:
    """Mesma regra, lida só do registro de conjuntos (nunca de ``ground_truth``)."""
    row = conn.execute(
        text("SELECT labeled_weeks, has_laundering FROM public.datasets WHERE slug = :slug"),
        {"slug": slug},
    ).one_or_none()
    if row is None:
        return block_reason(0, False)
    return block_reason(row.labeled_weeks, row.has_laundering)
