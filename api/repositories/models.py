"""Versões do modelo de um conjunto de dados: listagem, pedido de retreino e promoção.

As fichas (``lightgbm_vN.json``) são lidas do disco: ``MODEL_DIR/<slug>/`` tem os retreinos do
conjunto e ``MODEL_DIR/`` o modelo oficial. A API só lê JSON, nunca carrega o modelo (a imagem
não tem o LightGBM). ``datasets.active_model_version`` vazio = o oficial mais novo.

O que a tela compara (a versão nova contra a ativa no mesmo período de teste, a trava de promoção
e o retorno dos analistas usado) vem pronto da ficha, gravado pelo worker no treino. Do banco, a
API só conta os rótulos de ``analyst_labels``; nunca lê ``ground_truth``.
"""

import json
import math
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import Connection, text

from api.dependencies import User
from api.repositories.datasets import _job_response
from api.schemas.datasets import JobResponse
from api.schemas.models import (
    FeedbackClassCounts,
    FeedbackUsage,
    LabelBreakdown,
    ModelComparison,
    ModelMetrics,
    ModelsResponse,
    ModelVersion,
    TrainingFeedback,
    TrainRequest,
)
from fraudradar.config import get_settings
from fraudradar.datasets import (
    Dataset,
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)
from fraudradar.model.eligibility import training_block_reason
from fraudradar.model.feedback import (
    ANALYST,
    SIMULATED,
    closed_label_counts,
    feedback_block_reason,
)
from fraudradar.model.naming import (
    DATASET_PATTERN,
    OFFICIAL_PATTERN,
    dataset_version_name,
)

VERSION_PATTERN = OFFICIAL_PATTERN  # nome dos arquivos no disco (lightgbm_vN)


def _number_of(name: str) -> int:
    return int(name.rsplit("v", 1)[1])


def get_dataset(conn: Connection, slug: str) -> Dataset:
    try:
        return resolve_dataset(conn, slug)
    except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Conjunto de dados '{slug}' não encontrado."
        ) from exc


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value) if math.isfinite(value) else None


def _read_cards(folder: Path) -> dict[str, dict]:
    """Fichas legíveis de uma pasta, por nome de versão. Ficha estragada é ignorada."""
    cards: dict[str, dict] = {}
    for path in folder.glob("lightgbm_v*.json"):
        if not VERSION_PATTERN.fullmatch(path.stem):
            continue
        try:
            card = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(card, dict) and (folder / f"{path.stem}.txt").is_file():
            cards[path.stem] = card
    return cards


def _created_at(card: dict) -> datetime | None:
    try:
        return datetime.fromisoformat(str(card["created_at"]))
    except (KeyError, ValueError):
        return None


def comparison_of(card: dict) -> ModelComparison | None:
    """O bloco ``comparison`` da ficha; ``None`` em ficha antiga (sem ele) ou estragada."""
    try:
        return ModelComparison.model_validate(card["comparison"])
    except (KeyError, TypeError, ValidationError):
        return None


def label_breakdown(raw: dict) -> LabelBreakdown:
    """Contagens no formato da ficha (``by_class``, ``by_source``, ``by_origin``) → contrato."""

    def part(name: str) -> dict:
        value = raw.get(name)
        return value if isinstance(value, dict) else {}

    return LabelBreakdown(
        total=raw.get("total", 0),
        **part("by_class"),
        **part("by_source"),
        **part("by_origin"),
    )


def feedback_of(card: dict) -> FeedbackUsage | None:
    """O bloco ``feedback`` da ficha; ``None`` em ficha antiga (sem ele) ou estragada."""
    raw = card.get("feedback")
    if not isinstance(raw, dict):
        return None
    try:
        split = raw.get("split")
        labels = raw.get("labels_used")
        return FeedbackUsage(
            **{k: v for k, v in raw.items() if k in FeedbackUsage.model_fields and k != "split"},
            labels=label_breakdown(labels) if isinstance(labels, dict) else None,
            split=split.get("kind") if isinstance(split, dict) else None,
        )
    except (TypeError, ValidationError):
        return None


def _version(name: str, card: dict, source: str, active: bool) -> ModelVersion:
    metrics = card.get("metrics") if isinstance(card.get("metrics"), dict) else {}
    queue = metrics.get("queue_with_cut") if isinstance(metrics.get("queue_with_cut"), dict) else {}
    trees = card.get("trees")
    return ModelVersion(
        version=name,
        source=source,
        created_at=_created_at(card),
        trees=trees if isinstance(trees, int) else None,
        history_start=card.get("history_start"),
        train_end=card.get("train_end"),
        metrics=ModelMetrics(
            pr_auc=_number(metrics.get("pr_auc")),
            recall_at_fpr=_number(metrics.get("recall_at_fpr")),
            f1=_number(metrics.get("f1")),
            queue_recall=_number(queue.get("recall")),
            queue_precision=_number(queue.get("precision")),
            innocents_per_week=_number(queue.get("innocents_per_week")),
        ),
        active=active,
        comparison=comparison_of(card),
        feedback=feedback_of(card),
    )


def _catalog(dataset: Dataset) -> tuple[dict[str, dict], tuple[str, dict] | None]:
    """(retreinos do conjunto por nome ``<slug>/vN``, o oficial mais novo por ``lightgbm_vN``)."""
    root = Path(get_settings().model_dir)
    own = {
        dataset_version_name(dataset.slug, int(stem.removeprefix("lightgbm_v"))): card
        for stem, card in _read_cards(root / dataset.slug).items()
    }
    official = _read_cards(root)
    latest = max(official, key=lambda name: int(name.removeprefix("lightgbm_v")), default=None)
    return own, (None if latest is None else (latest, official[latest]))


def _running_train(conn: Connection, slug: str) -> JobResponse | None:
    row = (
        conn.execute(
            text(
                "SELECT * FROM public.jobs WHERE kind = 'train' AND dataset = :slug "
                "AND status IN ('queued', 'running') ORDER BY created_at DESC, id DESC LIMIT 1"
            ),
            {"slug": slug},
        )
        .mappings()
        .first()
    )
    return None if row is None else _job_response(row)


def _training_feedback(conn: Connection, dataset: Dataset, reason: str | None) -> TrainingFeedback:
    """O retorno dos períodos fechados disponível para o retreino, no schema do conjunto."""
    use_dataset(conn, dataset)
    counts = closed_label_counts(conn)

    def blocked(include_simulated: bool) -> str | None:
        return reason or feedback_block_reason(counts, include_simulated)

    return TrainingFeedback(
        analyst=FeedbackClassCounts(
            laundering=counts.laundering(ANALYST), false_positive=counts.false_positive(ANALYST)
        ),
        simulated=FeedbackClassCounts(
            laundering=counts.laundering(SIMULATED),
            false_positive=counts.false_positive(SIMULATED),
        ),
        blocked_reason=blocked(False),
        blocked_reason_with_simulated=blocked(True),
    )


def list_models(conn: Connection, slug: str) -> ModelsResponse:
    dataset = get_dataset(conn, slug)
    own, official = _catalog(dataset)
    active = dataset.active_model_version
    official_name = official[0] if official else None
    if active is None:
        active = official_name
    versions = [
        _version(name, card, "dataset", name == active)
        for name, card in sorted(own.items(), key=lambda item: -_number_of(item[0]))
    ]
    if official is not None:
        versions.append(_version(official_name, official[1], "official", official_name == active))
    job = _running_train(conn, slug)
    # Só o registro: a API nunca lê ground_truth (o worker mede e grava o resumo).
    reason = training_block_reason(conn, dataset.slug)
    if reason is None and job is not None:
        reason = "Já existe um treino em andamento para este conjunto."
    return ModelsResponse(
        dataset=dataset.slug,
        active_version=active,
        versions=versions,
        can_train=reason is None,
        train_blocked_reason=reason,
        training_job=job,
        training_feedback=_training_feedback(conn, dataset, reason),
    )


def _audit(conn: Connection, user: User, action: str, entity_id: str, details: dict) -> None:
    conn.execute(
        text(
            "INSERT INTO audit_log (actor, action, entity, entity_id, details) "
            "VALUES (:actor, :action, 'model', :id, CAST(:details AS jsonb))"
        ),
        {
            "actor": user.name,
            "action": action,
            "id": entity_id,
            "details": json.dumps({**details, "user_id": user.id}),
        },
    )


def enqueue_train(
    conn: Connection, slug: str, user: User, request: TrainRequest | None = None
) -> JobResponse:
    request = request or TrainRequest()
    dataset = get_dataset(conn, slug)
    # Serializa pedidos simultâneos do mesmo conjunto: o segundo vê o job do primeiro.
    conn.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"fraudradar.train.{dataset.slug}"},
    )
    reason = training_block_reason(conn, dataset.slug)
    if reason is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, reason)
    if _running_train(conn, dataset.slug) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe um treino em andamento para este conjunto."
        )
    use_dataset(conn, dataset)  # a auditoria e os rótulos são do schema do conjunto
    if request.use_feedback:
        # A mesma regra que o worker confere de novo antes de treinar.
        reason = feedback_block_reason(closed_label_counts(conn), request.include_simulated)
        if reason is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, reason)
    options = request.model_dump()
    row = (
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by) "
                "VALUES ('train', :dataset, CAST(:payload AS jsonb), :actor) RETURNING *"
            ),
            {"dataset": dataset.slug, "payload": json.dumps(options), "actor": user.name},
        )
        .mappings()
        .one()
    )
    _audit(conn, user, "train_enqueued", str(row["id"]), {"dataset": dataset.slug, **options})
    return _job_response(row)


def promote(conn: Connection, slug: str, version: str, user: User) -> ModelsResponse:
    if not (OFFICIAL_PATTERN.fullmatch(version) or DATASET_PATTERN.fullmatch(version)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Versão do modelo não encontrada.")
    dataset = get_dataset(conn, slug)
    own, official = _catalog(dataset)
    if version in own:
        new_value: str | None = version
        # Trava de promoção: a ficha guarda a comparação com a versão ativa no mesmo período de
        # teste. Ficha antiga, sem comparação, promove como antes.
        comparison = comparison_of(own[version])
        if comparison is not None and not comparison.gate.passed:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                comparison.gate.reason or "A trava de promoção bloqueou esta versão.",
            )
    elif official is not None and official[0] == version:
        new_value = None  # volta a seguir o modelo oficial mais novo
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Versão do modelo não encontrada.")
    # Trava a linha do conjunto: duas promoções simultâneas não se atropelam.
    previous = conn.execute(
        text("SELECT active_model_version FROM public.datasets WHERE slug = :slug FOR UPDATE"),
        {"slug": dataset.slug},
    ).scalar_one()
    current = previous if previous is not None else (official[0] if official else None)
    if version == current:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta já é a versão ativa do conjunto.")
    conn.execute(
        text("UPDATE public.datasets SET active_model_version = :value WHERE slug = :slug"),
        {"value": new_value, "slug": dataset.slug},
    )
    use_dataset(conn, dataset)
    _audit(
        conn,
        user,
        "model_promoted",
        version,
        {"dataset": dataset.slug, "previous": current, "current": version},
    )
    return list_models(conn, slug)
