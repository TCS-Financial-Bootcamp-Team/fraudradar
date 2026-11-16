"""``python -m worker feedback-eval``: o experimento honesto do retorno dos analistas.

Treina dois modelos com a MESMA divisão (a do retorno), o mesmo dado e os mesmos parâmetros: o
controle só com o gabarito e o tratamento com o gabarito e os pesos do retorno
(``fraudradar.model.training.measure_feedback``). A diferença entre os dois é o efeito do retorno,
separado do efeito de treinar com semanas mais recentes, que os dois têm. Não registra versão: o
resultado vai para ``models/<slug>/feedback-eval-<data e hora>.json``.

Como o treino, lê ``ground_truth`` (alvo e régua) e nunca o usa para dar nota.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy import Engine

from fraudradar.config import get_settings
from fraudradar.datasets import Dataset, use_dataset
from fraudradar.model.dataset_data import read_labeled
from fraudradar.model.eligibility import block_message
from worker.errors import WorkerError
from worker.labels import refresh_label_stats
from worker.train_job import TrainOptions, prepare_feedback

log = logging.getLogger("worker")


def run_feedback_eval(
    engine: Engine,
    dataset: Dataset,
    *,
    include_simulated: bool = False,
    model_dir: Path | None = None,
) -> tuple[Path, dict]:
    """Roda o experimento no conjunto e grava o JSON; devolve o caminho e o resultado."""
    from fraudradar.model.training import measure_feedback

    stats = refresh_label_stats(engine, dataset)
    reason = block_message(stats.labeled_weeks, stats.has_laundering)
    if reason is not None:
        raise WorkerError(reason)
    options = TrainOptions(use_feedback=True, include_simulated=include_simulated)
    with engine.connect() as conn:
        use_dataset(conn, dataset)
        log.info("lendo transações, gabarito e retorno dos analistas de %s", dataset.slug)
        transactions, ground_truth = read_labeled(conn)
        plan, transactions = prepare_feedback(conn, transactions, options)
        conn.rollback()

    def report(percent: int, message: str) -> None:
        log.info("%d%% %s", percent, message)

    try:
        result = measure_feedback(transactions, ground_truth, plan, progress=report)
    except ValueError as exc:
        raise WorkerError(f"Não foi possível treinar: {exc}.") from exc
    created = datetime.now().astimezone()
    folder = Path(model_dir or get_settings().model_dir) / dataset.slug
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"feedback-eval-{created:%Y%m%d-%H%M%S}.json"
    payload = {
        "dataset": dataset.slug,
        "created_at": created.isoformat(timespec="seconds"),
        "include_simulated": include_simulated,
        "notes": [
            "control: só o gabarito; treatment: gabarito + pesos do retorno; mesma divisão no "
            "tempo, mesmo dado e mesmos parâmetros nos dois",
            "difference: treatment - control; as métricas são do período de teste (depois de "
            "split.train_end), contra o gabarito",
        ],
        **result,
    }
    # UTF-8 explícito, como as fichas do modelo.
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path, payload
