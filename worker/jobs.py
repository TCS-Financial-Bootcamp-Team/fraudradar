"""Executor persistente dos trabalhos registrados em ``public.jobs``."""

import logging
import signal
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date
from threading import Event
from typing import Any

import pandas as pd
from sqlalchemy import Engine, text

from fraudradar.data.simulation import SimulationError, simulate_transactions
from fraudradar.datasets import Dataset, DatasetNotFoundError, resolve_dataset, use_dataset
from worker.errors import WorkerError
from worker.import_job import import_handler, pull_new_rows

log = logging.getLogger("worker.jobs")


@dataclass(frozen=True)
class Job:
    id: int
    kind: str
    dataset: str
    payload: dict[str, Any]
    created_by: str


Progress = Callable[[int, str | None], None]
Handler = Callable[[Engine, Job, Progress], str | None]

# Pontos de extensão carregados por integrações externas. Vazio por padrão: a parte B2 registra
# aqui o sincronizador sem acoplar o executor à implementação da fonte.
PRE_PROCESS_HOOKS: list[Callable[[Engine, Dataset], None]] = []


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
                    RETURNING job.id, job.kind, job.dataset, job.payload, job.created_by
                """)
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    return Job(
        id=row["id"],
        kind=row["kind"],
        dataset=row["dataset"],
        payload=row["payload"],
        created_by=row["created_by"],
    )


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


def _resolve_dataset(engine: Engine, slug: str) -> Dataset:
    with engine.connect() as conn:
        try:
            return resolve_dataset(conn, slug)
        except DatasetNotFoundError as exc:
            raise WorkerError(f"conjunto de dados '{slug}' não encontrado") from exc


def process_handler(engine: Engine, job: Job, progress: Progress) -> str:
    """Executa a rodada contínua ou um backfill explícito de compatibilidade."""
    from worker import batch

    dataset = _resolve_dataset(engine, job.dataset)
    for hook in PRE_PROCESS_HOOKS:
        hook(engine, dataset)
    progress(10, "Preparando o processamento do conjunto de dados.")
    mode = job.payload.get("mode", "continuous")
    if mode == "continuous":
        result = batch.run_continuous(engine, dataset=dataset)
    elif mode == "replay":
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
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE public.processing_settings SET last_run_at = now(),"
                " next_run_at = CASE WHEN enabled"
                "   THEN now() + make_interval(mins => interval_minutes) ELSE next_run_at END,"
                " updated_at = now() WHERE dataset = :dataset"
            ),
            {"dataset": dataset.slug},
        )
    if not result.processed:
        message = result.notes[0] if result.notes else "Nada novo para processar."
    else:
        message = f"Processamento concluído: {len(result.processed)} período(s) processado(s)."
    progress(95, message)
    return message


def simulate_handler(engine: Engine, job: Job, progress: Progress) -> str:
    """Gera uma ingestão sintética e agenda a recomputação do conjunto."""
    dataset = _resolve_dataset(engine, job.dataset)
    try:
        transactions = int(job.payload["transactions"])
        days = int(job.payload["days"])
        inject_pattern = bool(job.payload.get("inject_pattern", False))
    except (KeyError, TypeError, ValueError) as exc:
        raise WorkerError("parâmetros inválidos no trabalho de simulação") from exc
    if not 50 <= transactions <= 5000 or not 1 <= days <= 7:
        raise WorkerError("a simulação aceita de 50 a 5.000 transações e de 1 a 7 dias")

    progress(10, "Preparando a amostra do conjunto de dados.")
    with engine.begin() as conn:
        use_dataset(conn, dataset)
        last_at = conn.execute(text("SELECT max(occurred_at) FROM transactions")).scalar()
        rows = conn.execute(
            text(
                "SELECT occurred_at, sender, receiver, amount, payment_currency,"
                " received_currency, sender_country, receiver_country, payment_type"
                " FROM transactions ORDER BY id DESC LIMIT 5000"
            )
        ).mappings()
        sample = pd.DataFrame(list(rows))
        accounts = list(
            conn.execute(
                text("SELECT account FROM accounts ORDER BY account LIMIT 10000")
            ).scalars()
        )
        if len(accounts) < 2:
            accounts = list(
                conn.execute(
                    text(
                        "SELECT DISTINCT account FROM ("
                        " SELECT sender AS account FROM transactions"
                        " UNION ALL SELECT receiver AS account FROM transactions"
                        ") existing_accounts LIMIT 10000"
                    )
                ).scalars()
            )
        try:
            generated = simulate_transactions(
                sample,
                accounts,
                transactions=transactions,
                days=days,
                inject_pattern=inject_pattern,
                seed=job.id,
                last_occurred_at=last_at,
            )
        except SimulationError as exc:
            raise WorkerError(str(exc)) from exc
        ingestion_id = conn.execute(
            text(
                "INSERT INTO ingestions (source, row_count, created_by)"
                " VALUES ('simulation', :rows, :actor) RETURNING id"
            ),
            {"rows": len(generated), "actor": job.created_by},
        ).scalar_one()
        records = generated.to_dict(orient="records")
        for record in records:
            record["ingestion_id"] = ingestion_id
        conn.execute(
            text(
                "INSERT INTO transactions (occurred_at, sender, receiver, amount,"
                " payment_currency, received_currency, sender_country, receiver_country,"
                " payment_type, ingestion_id) VALUES (:occurred_at, :sender, :receiver, :amount,"
                " :payment_currency, :received_currency, :sender_country, :receiver_country,"
                " :payment_type, :ingestion_id)"
            ),
            records,
        )
        conn.execute(
            text(
                "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
                " VALUES (:actor, 'simulation_created', 'ingestion', :id,"
                " jsonb_build_object('transactions', :rows, 'days', :days,"
                " 'inject_pattern', :pattern))"
            ),
            {
                "actor": job.created_by,
                "id": str(ingestion_id),
                "rows": len(generated),
                "days": days,
                "pattern": inject_pattern,
            },
        )
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by)"
                " VALUES ('process', :dataset, '{}'::jsonb, :actor)"
            ),
            {"dataset": dataset.slug, "actor": job.created_by},
        )
    progress(95, "Transações simuladas; processamento enfileirado.")
    return "Transações simuladas; processamento enfileirado."


# Ganchos executados antes de cada ``process``: (engine, dataset) -> None.
PRE_PROCESS_HOOKS: list = []
PRE_PROCESS_HOOKS.append(pull_new_rows)  # acompanha fontes externas (worker/import_job.py)

DEFAULT_HANDLERS: Mapping[str, Handler] = {
    "import": import_handler,
    "process": process_handler,
    "simulate": simulate_handler,
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
        final_message = handler(engine, job, progress)
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
        _finish(engine, job.id, failed=False, message=final_message or "Trabalho concluído.")
    return True


def recover_stale_jobs(engine: Engine) -> int:
    """Falha trabalhos abandonados por um worker que parou há mais de duas horas."""
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                "UPDATE public.jobs SET status = 'failed', progress = 0,"
                " message = 'Trabalho interrompido', finished_at = now()"
                " WHERE status = 'running'"
                " AND started_at < now() - INTERVAL '2 hours' RETURNING id"
            )
        ).all()
    return len(rows)


def schedule_due_process_jobs(engine: Engine) -> int:
    """Agenda uma única rodada vencida por conjunto e avança o próximo horário."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.processing_settings (dataset)"
                " SELECT slug FROM public.datasets ON CONFLICT (dataset) DO NOTHING"
            )
        )
        due = list(
            conn.execute(
                text(
                    "SELECT settings.dataset, settings.interval_minutes"
                    " FROM public.processing_settings settings"
                    " WHERE settings.enabled AND settings.next_run_at <= now()"
                    " AND NOT EXISTS (SELECT 1 FROM public.jobs job"
                    "   WHERE job.dataset = settings.dataset AND job.kind = 'process'"
                    "     AND job.status IN ('queued', 'running'))"
                    " ORDER BY settings.next_run_at, settings.dataset"
                    " FOR UPDATE OF settings SKIP LOCKED"
                )
            ).mappings()
        )
        for setting in due:
            conn.execute(
                text(
                    "INSERT INTO public.jobs (kind, dataset, payload, created_by)"
                    " VALUES ('process', :dataset, '{}'::jsonb, 'Agendador')"
                ),
                {"dataset": setting["dataset"]},
            )
            conn.execute(
                text(
                    "UPDATE public.processing_settings"
                    " SET next_run_at = now() + make_interval(mins => interval_minutes),"
                    " updated_at = now() WHERE dataset = :dataset"
                ),
                {"dataset": setting["dataset"]},
            )
    return len(due)


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
            recovered = recover_stale_jobs(engine)
            if recovered:
                log.warning("%d trabalho(s) interrompido(s) recuperado(s)", recovered)
            scheduled = schedule_due_process_jobs(engine)
            if scheduled:
                log.info("%d processamento(s) automático(s) enfileirado(s)", scheduled)
            if not process_next_job(engine):
                stop.wait(idle_seconds)
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        log.info("executor de trabalhos encerrado")
