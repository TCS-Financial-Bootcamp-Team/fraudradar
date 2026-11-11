"""Trabalho ``train``: retreina o modelo de um conjunto de dados a partir do banco dele.

Lê transações e gabarito do schema do conjunto, treina com a configuração e a divisão no tempo
oficiais (``fraudradar.model``) e grava ``models/<slug>/lightgbm_vN.txt`` com a ficha. A versão
nova NÃO vira a ativa: quem promove é o analista (``POST .../models/{versão}/promote``).
O gabarito só treina e mede; o modelo nunca o lê para dar nota.
"""

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import Engine, text

from fraudradar.config import get_settings
from fraudradar.datasets import DatasetNotFoundError, resolve_dataset, use_dataset
from fraudradar.model.dataset_data import read_labeled
from fraudradar.model.eligibility import block_reason
from fraudradar.model.naming import dataset_version_name
from worker.errors import WorkerError
from worker.labels import refresh_label_stats

if TYPE_CHECKING:
    from worker.jobs import Job, Progress

log = logging.getLogger("worker.train")

ACTOR = "worker"
# A leitura vai até 30%; o treino ocupa o resto (a última etapa avisa 90% e o job fecha em 100).
READ_SHARE = 30


def _official_latest(root: Path) -> int:
    from fraudradar.model.training import _versions

    return max(_versions(root), default=0)


def train_handler(engine: Engine, job: "Job", progress: "Progress") -> None:
    # LightGBM só é importado aqui: a imagem da API e o resto do worker não precisam dele.
    from fraudradar.model.training import resolve_split, train_version

    with engine.connect() as conn:
        try:
            dataset = resolve_dataset(conn, job.dataset)
        except DatasetNotFoundError as exc:
            raise WorkerError(f"conjunto de dados '{job.dataset}' não encontrado") from exc
    # Mede o gabarito agora (o registro pode estar velho) e grava o resumo para a API.
    stats = refresh_label_stats(engine, dataset)
    reason = block_reason(stats.labeled_weeks, stats.has_laundering)
    if reason is not None:
        raise WorkerError(reason)
    with engine.connect() as conn:
        use_dataset(conn, dataset)
        progress(5, "Lendo transações e gabarito do conjunto.")
        transactions, ground_truth = read_labeled(conn)
        conn.rollback()
    progress(
        READ_SHARE,
        f"{len(transactions):,} transações lidas; calculando variáveis.".replace(",", "."),
    )

    def stage(percent: int, message: str) -> None:
        progress(READ_SHARE + percent * (90 - READ_SHARE) // 100, message)

    root = Path(get_settings().model_dir)
    try:
        card = train_version(
            transactions,
            ground_truth,
            root / dataset.slug,
            split=resolve_split(transactions),
            # Numera depois do modelo oficial: o nome da versão é chave em model_versions.
            first_version=_official_latest(root) + 1,
            progress=stage,
            # Vai na ficha: só neste conjunto o worker recusa as semanas que o modelo já viu.
            dataset=dataset.slug,
        )
    except ValueError as exc:
        raise WorkerError(f"Não foi possível treinar: {exc}.") from exc
    version = dataset_version_name(dataset.slug, card["version"])
    with engine.begin() as conn:
        use_dataset(conn, dataset)
        conn.execute(
            text(
                "INSERT INTO audit_log (actor, action, entity, entity_id, details) "
                "VALUES (:actor, 'model_trained', 'model', :version, CAST(:details AS jsonb))"
            ),
            {
                "actor": ACTOR,
                "version": version,
                "details": json.dumps({"dataset": dataset.slug, "job_id": job.id}),
            },
        )
    refresh_label_stats(engine, dataset)
    progress(95, f"Versão {version} gravada. Falta promovê-la para usá-la.")
