"""Executor persistente dos trabalhos registrados em ``public.jobs``."""

import logging
import signal
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date
from threading import Event
from typing import Any

from sqlalchemy import Engine, text

from fraudradar.datasets import DatasetNotFoundError, resolve_dataset
from worker.errors import WorkerError

log = logging.getLogger("worker.jobs")


@dataclass(frozen=True)
class Job:
    id: int
    kind: str
    dataset: str
    payload: dict[str, Any]


Progress = Callable[[int, str | None], None]
Handler = Callable[[Engine, Job, Progress], None]


def claim_next_job(engine: Engine) -> Job | None:
    """Marca e devolve o trabalho mais antigo sem disputar a mesma linha com outro worker."""
    with engine.begin() as conn:
        row = (
            conn.execute(
                text("""
                    WITH next_job AS (
                        SELECT id
                        FROM public.jobs
                        WHERE status = 'queued'
                        ORDER BY created_at, id
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                    )
                    UPDATE public.jobs AS job
                    SET status = 'running', progress = 0,
                        message = 'Trabalho iniciado.', started_at = now(), finished_at = NULL
                    FROM next_job
                    WHERE job.id = next_job.id
                    RETURNING job.id, job.kind, job.dataset, job.payload
                """)
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    return Job(id=row["id"], kind=row["kind"], dataset=row["dataset"], payload=row["payload"])


def update_progress(engine: Engine, job_id: int, progress: int, message: str | None) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE public.jobs SET progress = :progress, message = :message "
                "WHERE id = :id AND status = 'running'"
            ),
            {"id": job_id, "progress": max(0, min(100, progress)), "message": message},
        )


def _finish(engine: Engine, job_id: int, *, failed: bool, message: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE public.jobs SET status = :status, progress = :progress, "
                "message = :message, finished_at = now() WHERE id = :id AND status = 'running'"
            ),
            {
                "id": job_id,
                "status": "failed" if failed else "done",
                "progress": 0 if failed else 100,
                "message": message,
            },
        )


def _not_implemented(kind: str) -> Handler:
    label = "Importação" if kind == "import" else "Treino"

    def handler(_engine: Engine, _job: Job, _progress: Progress) -> None:
        raise WorkerError(f"{label} ainda não implementado nesta fase.")

    return handler


def process_handler(engine: Engine, job: Job, progress: Progress) -> None:
    """Executa replay por padrão; o payload já aceita backfill para fases seguintes."""
    from worker import batch

    with engine.connect() as conn:
        try:
            dataset = resolve_dataset(conn, job.dataset)
        except DatasetNotFoundError as exc:
            raise WorkerError(f"conjunto de dados '{job.dataset}' não encontrado") from exc
    progress(10, "Preparando o processamento do conjunto de dados.")
    mode = job.payload.get("mode", "replay")
    if mode == "replay":
        result = batch.run_replay(engine, dataset=dataset)
    elif mode == "backfill":
        try:
            start = date.fromisoformat(job.payload["from"]) if job.payload.get("from") else None
            end = date.fromisoformat(job.payload["to"]) if job.payload.get("to") else None
        except (TypeError, ValueError) as exc:
            raise WorkerError("datas inválidas no trabalho de processamento") from exc
        result = batch.run_backfill(engine, start, end, dataset=dataset)
    else:
        raise WorkerError(f"modo de processamento desconhecido: {mode}")
    progress(
        95,
        f"Processamento concluído: {len(result.processed)} semana(s) processada(s).",
    )


DEFAULT_HANDLERS: Mapping[str, Handler] = {
    "import": _not_implemented("import"),
    "process": process_handler,
    "train": _not_implemented("train"),
}


def process_next_job(engine: Engine, handlers: Mapping[str, Handler] = DEFAULT_HANDLERS) -> bool:
    """Processa no máximo um trabalho e devolve se encontrou algum."""
    job = claim_next_job(engine)
    if job is None:
        return False

    def progress(value: int, message: str | None = None) -> None:
        update_progress(engine, job.id, value, message)

    try:
        handler = handlers.get(job.kind)
        if handler is None:
            raise WorkerError(f"tipo de trabalho desconhecido: {job.kind}")
        handler(engine, job, progress)
    except WorkerError as exc:
        log.error("trabalho %s falhou: %s", job.id, exc)
        _finish(engine, job.id, failed=True, message=str(exc))
    except Exception:  # noqa: BLE001 - falha inesperada fica completa somente no log interno
        log.exception("trabalho %s falhou de forma inesperada", job.id)
        _finish(
            engine,
            job.id,
            failed=True,
            message="O trabalho falhou. Consulte os logs do worker.",
        )
    else:
        _finish(engine, job.id, failed=False, message="Trabalho concluído.")
    return True


def serve(engine: Engine, *, idle_seconds: float = 3.0, stop_event: Event | None = None) -> None:
    """Atende a fila até SIGINT/SIGTERM, aguardando sem espera bloqueante quando está ociosa."""
    stop = stop_event or Event()

    def request_stop(signum, _frame) -> None:
        log.info("sinal %s recebido; encerrando após o trabalho atual", signum)
        stop.set()

    previous = {}
    if stop_event is None:
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous[sig] = signal.signal(sig, request_stop)
    log.info("executor de trabalhos iniciado")
    try:
        while not stop.is_set():
            if not process_next_job(engine):
                stop.wait(idle_seconds)
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        log.info("executor de trabalhos encerrado")
