"""Resumo do gabarito de um conjunto, gravado no registro ``public.datasets``.

Junto com ``worker/metrics.py``, é o único código que lê ``ground_truth``. A API não lê o
gabarito (ele fica fora do alcance dela): decide se o retreino é possível pelas colunas
``labeled_weeks`` e ``has_laundering`` que esta rotina preenche. A consulta junta o gabarito com
as transações (9,5 milhões de linhas no SAML-D), por isso roda aqui e nunca na requisição.

Ela roda sozinha depois de ``load``, de uma importação com gabarito e de cada treino. Num banco
que já existia antes do resumo (ou que mudou por fora do worker), ``python -m worker labels``
mede de novo todos os conjuntos (``refresh_registry``).
"""

from dataclasses import dataclass

from sqlalchemy import Connection, Engine, text

from fraudradar.datasets import Dataset, resolve_dataset, use_dataset

DEFAULT_SLUG = "saml-d"


@dataclass(frozen=True)
class LabelStats:
    labeled_weeks: int
    has_laundering: bool


def compute_label_stats(conn: Connection) -> LabelStats:
    """Semanas com transação rotulada e se há alguma lavagem, no schema em uso na conexão."""
    row = conn.execute(
        text(
            "SELECT count(DISTINCT date_trunc('week', t.occurred_at)) AS weeks, "
            "coalesce(bool_or(g.label = 1), false) AS has_laundering "
            "FROM ground_truth g JOIN transactions t ON t.id = g.transaction_id"
        )
    ).one()
    return LabelStats(labeled_weeks=int(row.weeks), has_laundering=bool(row.has_laundering))


def store_label_stats(conn: Connection, slug: str) -> LabelStats:
    """Mede o gabarito do schema em uso e grava no registro do conjunto ``slug``."""
    stats = compute_label_stats(conn)
    conn.execute(
        text(
            "UPDATE public.datasets SET labeled_weeks = :weeks, has_laundering = :laundering, "
            "labels_checked_at = now() WHERE slug = :slug"
        ),
        {"weeks": stats.labeled_weeks, "laundering": stats.has_laundering, "slug": slug},
    )
    return stats


def refresh_label_stats(engine: Engine, dataset: Dataset | None = None) -> LabelStats:
    """Mede e grava numa transação própria. Sem ``dataset``, é o SAML-D (schema ``public``)."""
    with engine.begin() as conn:
        if dataset is not None:
            use_dataset(conn, dataset)
        return store_label_stats(conn, dataset.slug if dataset is not None else DEFAULT_SLUG)


def registered_datasets(conn: Connection) -> list[Dataset]:
    """Todos os conjuntos do registro ``public.datasets``, em ordem de slug."""
    slugs = conn.execute(text("SELECT slug FROM public.datasets ORDER BY slug")).scalars().all()
    return [resolve_dataset(conn, slug) for slug in slugs]


def refresh_registry(
    engine: Engine, datasets: list[Dataset] | None = None
) -> dict[str, LabelStats]:
    """Mede de novo e grava o resumo do gabarito de cada conjunto (padrão: todos os registrados).

    Cada conjunto numa transação própria: o que já foi medido fica gravado mesmo se outro falhar.
    """
    if datasets is None:
        with engine.connect() as conn:
            datasets = registered_datasets(conn)
    return {dataset.slug: refresh_label_stats(engine, dataset) for dataset in datasets}
