"""Trabalho ``import`` e acompanhamento de fontes externas (docs/external-data.md).

- ``import_handler``: lê a tabela da fonte em lotes (somente leitura), grava em ``transactions``
  (e em ``ground_truth``, só quando a fonte tem ``Is_laundering``), registra um envio com
  ``source = 'connection'`` e, ao terminar, enfileira o ``process`` do conjunto. Tudo ou nada:
  qualquer linha inválida desfaz a importação inteira.
- ``pull_new_rows``: gancho executado antes de cada ``process``. Para as conexões em modo
  ``follow``/``both`` do conjunto, lê só as linhas depois da última posição (coluna de
  controle) e as acrescenta. Erro da fonte não derruba o processamento: fica no status da
  conexão.

O gabarito nunca é lido para dar nota: ele só vai para ``ground_truth``.
"""

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy import Connection, Engine, text

from fraudradar.data.ingestion import InvalidTransactionsError, Transaction
from fraudradar.datasets import (
    Dataset,
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)
from fraudradar.sources import compatibility, reader
from fraudradar.sources.connection import (
    READ_STATEMENT_TIMEOUT_MS,
    ExternalSource,
    SourceError,
    open_readonly,
)
from fraudradar.sources.crypto import CannotDecryptError, SecretKeyMissingError, decrypt_password
from worker.errors import WorkerError
from worker.labels import store_label_stats

if TYPE_CHECKING:
    from worker.jobs import Job, Progress

log = logging.getLogger("worker.import")

_TRANSACTION_COLUMNS = ("id", *Transaction._fields, "ingestion_id")
_MAX_PROGRESS = 90


@dataclass
class _Connection:
    id: int
    name: str
    source: ExternalSource
    mode: str
    position: str | None


def _load_connection(conn: Connection, connection_id: int) -> _Connection:
    row = (
        conn.execute(
            text(
                "SELECT id, name, host, port, database, username, password_encrypted, "
                "source_table, control_column, mode, last_position "
                "FROM public.external_connections WHERE id = :id"
            ),
            {"id": connection_id},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise WorkerError("conexão externa não encontrada")
    try:
        password = decrypt_password(row["password_encrypted"])
    except (SecretKeyMissingError, CannotDecryptError) as exc:
        raise WorkerError(str(exc)) from exc
    source = ExternalSource(
        host=row["host"],
        port=row["port"],
        database=row["database"],
        user=row["username"],
        password=password,
        table=row["source_table"],
        control_column=row["control_column"],
    )
    return _Connection(
        row["id"], row["name"], source, row["mode"] or "history", row["last_position"]
    )


def _record_failure(engine: Engine, connection_id: int, message: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE public.external_connections SET status = 'error', last_error = :message "
                "WHERE id = :id"
            ),
            {"id": connection_id, "message": message[:500]},
        )


def _explain(exc: Exception) -> str:
    """Mensagem para o analista; nunca traz o valor das células nem a senha."""
    if isinstance(exc, InvalidTransactionsError):
        first = exc.errors[0]
        where = f"linha {first.line}" if first.line else "linha"
        if first.column:
            where += f", coluna {first.column}"
        extra = f" (e mais {len(exc.errors) - 1} problema(s))" if len(exc.errors) > 1 else ""
        return f"Dados inválidos na fonte ({where}): {first.message}{extra}"
    return str(exc)


def _write_batch(conn: Connection, batch: reader.SourceBatch, ingestion_id: int) -> None:
    """Grava um lote por COPY: ids reservados na sequência, gabarito só em ``ground_truth``."""
    ids = (
        conn.execute(
            text(
                "SELECT nextval(pg_get_serial_sequence('transactions', 'id')) "
                "FROM generate_series(1, :n)"
            ),
            {"n": len(batch.transactions)},
        )
        .scalars()
        .all()
    )
    cursor = conn.connection.driver_connection.cursor()
    with cursor:
        columns = ", ".join(_TRANSACTION_COLUMNS)
        with cursor.copy(f"COPY transactions ({columns}) FROM STDIN") as copy:
            for tx_id, tx in zip(ids, batch.transactions, strict=True):
                copy.write_row((tx_id, *tx, ingestion_id))
        if batch.truth is not None:
            statement = (
                "COPY ground_truth (transaction_id, label, original_typology, typology) FROM STDIN"
            )
            with cursor.copy(statement) as copy:
                for tx_id, truth in zip(ids, batch.truth, strict=True):
                    copy.write_row((tx_id, *truth))


def _create_ingestion(conn: Connection, source: ExternalSource, expected: int, actor: str) -> int:
    return conn.execute(
        text(
            "INSERT INTO ingestions (source, file_name, row_count, created_by) "
            "VALUES ('connection', :table, :rows, :actor) RETURNING id"
        ),
        {"table": source.table[:255], "rows": max(expected, 1), "actor": actor},
    ).scalar_one()


def _ingest(
    engine: Engine,
    dataset: Dataset,
    connection: _Connection,
    *,
    actor: str,
    progress: "Progress | None" = None,
    guard_closed_weeks: bool = False,
) -> tuple[int, str | None]:
    """Lê depois de ``connection.position`` e grava no conjunto, tudo numa transação.

    Devolve (linhas gravadas, nova posição). Levanta ``SourceError`` ou
    ``InvalidTransactionsError`` sem gravar nada.
    """
    source = connection.source
    position = connection.position
    total: int | None = None
    written = 0
    with (
        open_readonly(source, statement_timeout_ms=READ_STATEMENT_TIMEOUT_MS) as external,
        engine.begin() as conn,
    ):
        use_dataset(conn, dataset)
        info = reader.describe_table(external, source)
        if not info.exists:
            raise SourceError("A tabela de origem não existe ou não está visível.")
        if reader.missing_columns(info) or reader.wrong_types(info):
            raise SourceError("A tabela de origem deixou de ser compatível com o SAML-D.")
        if info.control is None:
            raise SourceError("A coluna de controle não existe na tabela de origem.")
        if progress is not None:
            total = compatibility.source_row_count(external, source)
        current = compatibility.dataset_range(conn) if guard_closed_weeks else None
        ingestion_id: int | None = None
        wrote_truth = False
        for batch in reader.read_batches(
            external, source, info, after=position, batch_size=reader.BATCH_SIZE
        ):
            if current is not None:
                first = min(tx.occurred_at for tx in batch.transactions).date()
                if compatibility.closed_weeks_conflict(first, current):
                    raise SourceError(
                        f"A fonte trouxe linhas de {first.isoformat()}, de uma semana já fechada "
                        "do conjunto. Semanas fechadas não mudam: use outro conjunto de dados."
                    )
            if ingestion_id is None:
                ingestion_id = _create_ingestion(conn, source, total or batch.rows_read, actor)
            _write_batch(conn, batch, ingestion_id)
            wrote_truth = wrote_truth or batch.truth is not None
            written += batch.rows_read
            position = batch.last_control or position
            if progress is not None:
                share = written / total if total else 0.5
                progress(
                    min(_MAX_PROGRESS, 5 + int(share * (_MAX_PROGRESS - 5))),
                    f"{written} linha(s) importadas" + (f" de {total}." if total else "."),
                )
        if ingestion_id is not None:
            conn.execute(
                text("UPDATE ingestions SET row_count = :rows WHERE id = :id"),
                {"rows": written, "id": ingestion_id},
            )
            conn.execute(
                text(
                    "INSERT INTO audit_log (actor, action, entity, entity_id, details) "
                    "VALUES (:actor, 'ingestion', 'ingestion', :id, CAST(:details AS jsonb))"
                ),
                {
                    "actor": actor,
                    "id": str(ingestion_id),
                    "details": json.dumps(
                        {
                            "source": "connection",
                            "connection_id": connection.id,
                            "row_count": written,
                        }
                    ),
                },
            )
        if wrote_truth:
            # Na mesma transação da carga: o resumo do gabarito nunca fica atrás das linhas.
            store_label_stats(conn, dataset.slug)
        conn.execute(
            text(
                "UPDATE public.external_connections SET last_position = :position, "
                "status = 'connected', last_error = NULL, last_synced_at = now() WHERE id = :id"
            ),
            {"position": position, "id": connection.id},
        )
    return written, position


def _enqueue_process(engine: Engine, slug: str, actor: str) -> None:
    """Enfileira ``process`` do conjunto, a não ser que já haja um na fila ou rodando."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by) "
                "SELECT 'process', :dataset, '{}'::jsonb, :actor WHERE NOT EXISTS ("
                "SELECT 1 FROM public.jobs WHERE kind = 'process' AND dataset = :dataset "
                "AND status IN ('queued', 'running'))"
            ),
            {"dataset": slug, "actor": actor},
        )


def import_handler(engine: Engine, job: "Job", progress: "Progress") -> None:
    try:
        connection_id = int(job.payload["connection_id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise WorkerError("trabalho de importação sem a conexão de origem") from exc
    with engine.connect() as conn:
        try:
            dataset = resolve_dataset(conn, job.dataset)
        except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
            raise WorkerError(f"conjunto de dados '{job.dataset}' não encontrado") from exc
        actor = conn.execute(
            text("SELECT created_by FROM public.jobs WHERE id = :id"), {"id": job.id}
        ).scalar_one()
        connection = _load_connection(conn, connection_id)
    progress(2, "Conectando à fonte externa em modo somente leitura.")
    # Importação lê o histórico inteiro: sempre desde o começo (posição vazia).
    connection.position = None
    try:
        written, _ = _ingest(engine, dataset, connection, actor=actor, progress=progress)
    except (SourceError, InvalidTransactionsError) as exc:
        message = _explain(exc)
        _record_failure(engine, connection_id, message)
        raise WorkerError(message) from exc
    except Exception:
        _record_failure(engine, connection_id, "A importação falhou. Consulte os logs do worker.")
        raise
    progress(
        95,
        f"{written} transação(ões) importadas. Processamento enfileirado."
        if written
        else "A fonte não tinha linhas para importar.",
    )
    _enqueue_process(engine, dataset.slug, actor)


def pull_new_rows(engine: Engine, dataset: Any, *_args: Any, **_kwargs: Any) -> None:
    """Gancho de ``PRE_PROCESS_HOOKS``: acrescenta ao conjunto as linhas novas das fontes.

    ``dataset`` é o ``Dataset`` ou o slug. Só considera conexões já ligadas ao conjunto, em modo
    ``follow``/``both``, fora de importação em andamento.
    """
    with engine.connect() as conn:
        if not isinstance(dataset, Dataset):
            try:
                dataset = resolve_dataset(conn, str(dataset))
            except (DatasetNotFoundError, InvalidDatasetSlugError):
                return
        ids = (
            conn.execute(
                text(
                    "SELECT id FROM public.external_connections "
                    "WHERE dataset = :slug AND mode IN ('follow', 'both') "
                    "AND status <> 'syncing' AND last_synced_at IS NOT NULL ORDER BY id"
                ),
                {"slug": dataset.slug},
            )
            .scalars()
            .all()
        )
    for connection_id in ids:
        _pull_one(engine, dataset, connection_id)


def _pull_one(engine: Engine, dataset: Dataset, connection_id: int) -> None:
    # Trava de sessão: duas rodadas ao mesmo tempo não puxam as mesmas linhas.
    key = f"fraudradar.pull.{connection_id}"
    guard = engine.connect()
    try:
        got = guard.execute(
            text("SELECT pg_try_advisory_lock(hashtext(:key))"), {"key": key}
        ).scalar_one()
        guard.commit()
        if not got:
            return
        try:
            with engine.connect() as conn:
                connection = _load_connection(conn, connection_id)
            written, _ = _ingest(
                engine,
                dataset,
                connection,
                actor="Acompanhamento de fonte externa",
                guard_closed_weeks=True,
            )
        except WorkerError as exc:
            log.warning("conexão %s ignorada nesta rodada: %s", connection_id, exc)
        except (SourceError, InvalidTransactionsError) as exc:
            message = _explain(exc)
            log.warning("conexão %s: %s", connection_id, message)
            _record_failure(engine, connection_id, message)
        else:
            if written:
                log.info(
                    "conexão %s: %s linha(s) nova(s) no conjunto %s",
                    connection_id,
                    written,
                    dataset.slug,
                )
        finally:
            guard.execute(text("SELECT pg_advisory_unlock(hashtext(:key))"), {"key": key})
            guard.commit()
    finally:
        guard.close()
