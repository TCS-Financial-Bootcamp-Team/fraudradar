"""Quando um conjunto de dados pode ser retreinado.

Sem LightGBM e sem tocar em ``ground_truth``: a API (imagem só com o grupo `api`) lê só o
registro ``public.datasets``, onde o worker guarda ``labeled_weeks`` e ``has_laundering``
(``worker/labels.py`` calcula depois de ``load``, de uma importação com gabarito e de cada
treino). O worker usa a mesma regra de texto, ``block_reason``, sobre o valor que acabou de medir.
"""

from sqlalchemy import Connection, text

from fraudradar.messages import Msg, msg
from fraudradar.model import MIN_LABELED_WEEKS

# O retreino não começa com outro treino do mesmo conjunto em andamento.
TRAIN_RUNNING = msg("model.train_running", "Já existe um treino em andamento para este conjunto.")


def block_message(labeled_weeks: int, has_laundering: bool) -> Msg | None:
    """Por que o conjunto não pode ser retreinado (texto em português, código e parâmetros);
    ``None`` quando pode.

    Retreino só com gabarito: precisa de transações rotuladas em semanas suficientes para a
    divisão no tempo (treino, validação e teste) e de pelo menos uma lavagem.
    """
    if labeled_weeks <= 0:
        return msg(
            "retrain.no_labels",
            "Este conjunto não tem gabarito: o retreino só é possível com transações rotuladas.",
        )
    if labeled_weeks < MIN_LABELED_WEEKS:
        return msg(
            "retrain.few_weeks",
            f"O gabarito cobre só {labeled_weeks} semana(s); o retreino precisa de pelo menos "
            f"{MIN_LABELED_WEEKS} semanas rotuladas.",
            weeks=labeled_weeks,
            min_weeks=MIN_LABELED_WEEKS,
        )
    if not has_laundering:
        return msg(
            "retrain.no_laundering",
            "O gabarito não tem nenhuma lavagem marcada; não há o que o modelo aprender.",
        )
    return None


def block_reason(labeled_weeks: int, has_laundering: bool) -> str | None:
    """O texto de ``block_message`` (em português); ``None`` quando pode."""
    message = block_message(labeled_weeks, has_laundering)
    return None if message is None else message.text


def training_block_message(conn: Connection, slug: str) -> Msg | None:
    """Mesma regra, lida só do registro de conjuntos (nunca de ``ground_truth``)."""
    row = conn.execute(
        text("SELECT labeled_weeks, has_laundering FROM public.datasets WHERE slug = :slug"),
        {"slug": slug},
    ).one_or_none()
    if row is None:
        return block_message(0, False)
    return block_message(row.labeled_weeks, row.has_laundering)


def training_block_reason(conn: Connection, slug: str) -> str | None:
    message = training_block_message(conn, slug)
    return None if message is None else message.text
