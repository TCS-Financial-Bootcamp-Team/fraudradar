"""Trabalho ``train``: retreina o modelo de um conjunto de dados a partir do banco dele.

Lê transações e gabarito do schema do conjunto, treina com a configuração oficial
(``fraudradar.model``) e grava ``models/<slug>/lightgbm_vN.txt`` com a ficha. A versão nova NÃO
vira a ativa: quem promove é o analista (``POST .../models/{versão}/promote``), e só se ela passar
na trava de promoção (a ficha guarda a comparação com a versão ativa no mesmo período de teste).

Com ``use_feedback`` no pedido, o retorno dos analistas (``analyst_labels`` dos períodos fechados)
entra como sinal a mais: a divisão no tempo passa a ser a do retorno e os rótulos pesam no treino
(docs/analyst-feedback.md). ``include_simulated`` inclui os rótulos do analista simulado.
O gabarito só treina e mede; o modelo nunca o lê para dar nota.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import pandas as pd
from sqlalchemy import Connection, Engine, text

from fraudradar.config import get_settings
from fraudradar.datasets import Dataset, DatasetNotFoundError, resolve_dataset, use_dataset
from fraudradar.features.history import week_start
from fraudradar.messages import msg
from fraudradar.model.dataset_data import (
    read_feedback,
    read_feedback_candidates,
    read_labeled,
    read_transactions,
)
from fraudradar.model.eligibility import block_message
from fraudradar.model.feedback import closed_label_counts, feedback_block_message, open_week
from fraudradar.model.naming import dataset_version_name
from worker.errors import WorkerError
from worker.labels import refresh_label_stats

if TYPE_CHECKING:
    from fraudradar.model.training import ActiveModel, FeedbackPlan
    from worker.jobs import Job, Progress

log = logging.getLogger("worker.train")

ACTOR = "worker"
# A leitura vai até 30%; o treino ocupa o resto (a última etapa avisa 90% e o job fecha em 100).
READ_SHARE = 30
_TEXT_COLUMNS = [
    "payment_currency",
    "received_currency",
    "sender_country",
    "receiver_country",
    "payment_type",
]


@dataclass(frozen=True)
class TrainOptions:
    use_feedback: bool = False
    include_simulated: bool = False

    @classmethod
    def from_payload(cls, payload: dict) -> "TrainOptions":
        options = cls(
            use_feedback=bool(payload.get("use_feedback", False)),
            include_simulated=bool(payload.get("include_simulated", False)),
        )
        if options.include_simulated and not options.use_feedback:
            raise WorkerError(
                "o retorno simulado só entra num retreino com o retorno dos analistas"
            )
        return options


def _official_latest(root: Path) -> int:
    from fraudradar.model.training import _versions

    return max(_versions(root), default=0)


def active_model(dataset: Dataset, root: Path) -> "ActiveModel | None":
    """A versão que dá as notas do conjunto hoje, como o lote a carrega; ``None`` quando ainda
    não existe modelo nenhum (a primeira versão não tem com quem ser comparada)."""
    from fraudradar.model.training import ActiveModel
    from worker.batch import _dataset_model, model_version

    if dataset.active_model_version is None and _official_latest(root) == 0:
        return None
    booster, card = _dataset_model(dataset, root)
    return ActiveModel(booster=booster, card=card, name=model_version(card))


def prepare_feedback(
    conn: Connection, transactions: pd.DataFrame, options: TrainOptions
) -> tuple["FeedbackPlan", pd.DataFrame]:
    """O retorno dos analistas pronto para o treino, no schema em uso na conexão: a divisão no
    tempo, o rótulo por transação e as transações cobertas que não têm gabarito, juntadas às
    rotuladas. Recusa (``WorkerError``, em português) o retorno que não serve para treinar."""
    from fraudradar.model.dataset_data import feedback_transactions
    from fraudradar.model.training import plan_feedback

    closed_before = open_week(conn)
    reason = feedback_block_message(
        closed_label_counts(conn, closed_before), options.include_simulated
    )
    if reason is not None or closed_before is None:
        raise WorkerError(reason or "o conjunto não tem transações")
    labels = read_feedback(conn, before=closed_before, include_simulated=options.include_simulated)
    truth_weeks = week_start(transactions["occurred_at"]).unique()
    try:
        plan = plan_feedback(labels, truth_weeks, options.include_simulated)
    except ValueError as exc:
        raise WorkerError(f"Não foi possível dividir o retreino com retorno: {exc}.") from exc
    reason = plan.block_message()
    if reason is not None:
        raise WorkerError(reason)
    training = plan.training_labels()
    candidates = read_feedback_candidates(conn, training["alert_id"].tolist())
    plan.transactions = feedback_transactions(training, candidates)
    missing = plan.missing_ids()
    if missing:
        extra = read_transactions(conn, missing)
        transactions = transactions.copy()
        for column in _TEXT_COLUMNS:
            # Mesmas categorias dos dois lados: o concat de categorias diferentes viraria texto.
            categories = transactions[column].cat.categories.union(extra[column].cat.categories)
            transactions[column] = transactions[column].cat.set_categories(categories)
            extra[column] = extra[column].cat.set_categories(categories)
        transactions = pd.concat([transactions, extra], ignore_index=True)
    return plan, transactions


def train_handler(engine: Engine, job: "Job", progress: "Progress") -> str:
    # LightGBM só é importado aqui: a imagem da API e o resto do worker não precisam dele.
    from fraudradar.model.training import resolve_split, train_version

    options = TrainOptions.from_payload(job.payload)
    with engine.connect() as conn:
        try:
            dataset = resolve_dataset(conn, job.dataset)
        except DatasetNotFoundError as exc:
            raise WorkerError(f"conjunto de dados '{job.dataset}' não encontrado") from exc
    # Mede o gabarito agora (o registro pode estar velho) e grava o resumo para a API.
    stats = refresh_label_stats(engine, dataset)
    reason = block_message(stats.labeled_weeks, stats.has_laundering)
    if reason is not None:
        raise WorkerError(reason)
    root = Path(get_settings().model_dir)
    # Antes da leitura longa: sem a versão ativa não há trava de promoção, e o erro sai na hora.
    active = active_model(dataset, root)
    plan = None
    with engine.connect() as conn:
        use_dataset(conn, dataset)
        progress(5, msg("job.train_reading", "Lendo transações e gabarito do conjunto."))
        transactions, ground_truth = read_labeled(conn)
        if options.use_feedback:
            progress(20, msg("job.train_reading_feedback", "Lendo o retorno dos analistas."))
            plan, transactions = prepare_feedback(conn, transactions, options)
        conn.rollback()
    progress(
        READ_SHARE,
        msg(
            "job.train_features",
            f"{len(transactions):,} transações lidas; calculando variáveis.".replace(",", "."),
            count=len(transactions),
        ),
    )

    def stage(percent: int, message: str) -> None:
        progress(READ_SHARE + percent * (90 - READ_SHARE) // 100, message)

    try:
        card = train_version(
            transactions,
            ground_truth,
            root / dataset.slug,
            split=None if plan is not None else resolve_split(transactions),
            # Numera depois do modelo oficial: o nome da versão é chave em model_versions.
            first_version=_official_latest(root) + 1,
            progress=stage,
            # Vai na ficha: só neste conjunto o worker recusa as semanas que o modelo já viu.
            dataset=dataset.slug,
            feedback=plan,
            active=active,
        )
    except ValueError as exc:
        raise WorkerError(f"Não foi possível treinar: {exc}.") from exc
    version = dataset_version_name(dataset.slug, card["version"])
    gate = (card.get("comparison") or {}).get("gate")
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
                "details": json.dumps(
                    {
                        "dataset": dataset.slug,
                        "job_id": job.id,
                        "use_feedback": options.use_feedback,
                        "include_simulated": options.include_simulated,
                        "compared_with": None if active is None else active.name,
                        "gate_passed": None if gate is None else gate["passed"],
                    }
                ),
            },
        )
    refresh_label_stats(engine, dataset)
    if gate is None or gate["passed"]:
        message = msg(
            "job.train_saved",
            f"Versão {version} gravada. Falta promovê-la para usá-la.",
            version=version,
        )
    else:
        message = msg(
            "job.train_blocked",
            f"Versão {version} gravada, mas a trava de promoção a bloqueou.",
            version=version,
        )
    progress(95, message)
    return message
