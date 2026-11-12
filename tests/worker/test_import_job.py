"""Importação de bancos externos pelo worker e acompanhamento das linhas novas."""

from datetime import datetime

import external_source
import pytest
from external_source import append_rows, create_source, make_rows
from sqlalchemy import text

from fraudradar.datasets import create_dataset, resolve_dataset, use_dataset
from fraudradar.sources.crypto import encrypt_password
from worker import jobs
from worker.import_job import pull_new_rows

source_env = external_source.source_env
allow_connection_source = external_source.allow_connection_source


def _connection(
    db,
    env,
    *,
    dataset="saml-d",
    mode="history",
    table="fake_source.saml",
    position=None,
    control="id",
    **extra,
) -> int:
    values = {
        "name": "Fonte",
        "host": env["host"],
        "port": env["port"],
        "database": env["database"],
        "username": env["user"],
        "password": encrypt_password(extra.pop("password", env["password"])),
        "table": table,
        "control": control,
        "dataset": dataset,
        "mode": mode,
        "position": position,
        "status": "syncing" if mode in ("history", "both") else "connected",
        "synced": None if mode in ("history", "both") else datetime.now(),
    }
    with db.begin() as conn:
        return conn.execute(
            text(
                "INSERT INTO public.external_connections (name, host, port, database, username, "
                "password_encrypted, source_table, control_column, dataset, mode, last_position, "
                "status, last_synced_at, created_by) VALUES (:name, :host, :port, :database, "
                ":username, :password, :table, :control, :dataset, :mode, :position, :status, "
                ":synced, 'Teste') RETURNING id"
            ),
            values,
        ).scalar_one()


def _enqueue_import(db, connection_id, dataset="saml-d") -> int:
    with db.begin() as conn:
        return conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by) VALUES "
                "('import', :dataset, CAST(:payload AS jsonb), 'Ana') RETURNING id"
            ),
            {"dataset": dataset, "payload": f'{{"connection_id": {connection_id}}}'},
        ).scalar_one()


def _job(db, job_id) -> dict:
    with db.connect() as conn:
        row = conn.execute(text("SELECT * FROM public.jobs WHERE id = :id"), {"id": job_id})
        return dict(row.mappings().one())


def _connection_row(db, connection_id) -> dict:
    with db.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM public.external_connections WHERE id = :id"), {"id": connection_id}
        )
        return dict(row.mappings().one())


def _count(db, table, dataset=None, where="true") -> int:
    with db.connect() as conn:
        if dataset is not None:
            use_dataset(conn, resolve_dataset(conn, dataset))
        return conn.execute(text(f"SELECT count(*) FROM {table} WHERE {where}")).scalar_one()


# --- importação ----------------------------------------------------------------------------------


def test_import_writes_transactions_and_truth_only_into_ground_truth(
    db, source_env, allow_connection_source
):
    create_source(db, make_rows(25))
    connection_id = _connection(db, source_env)
    job_id = _enqueue_import(db, connection_id)
    assert jobs.process_next_job(db) is True
    job = _job(db, job_id)
    assert job["status"] == "done", job["message"]

    assert _count(db, "transactions") == 25
    assert _count(db, "ground_truth") == 25
    assert _count(db, "ground_truth", where="label = 1") == 5
    with db.connect() as conn:
        ingestion = conn.execute(text("SELECT * FROM ingestions")).mappings().one()
        sample = conn.execute(
            text(
                "SELECT t.sender, t.amount, g.label, g.original_typology, g.typology "
                "FROM transactions t JOIN ground_truth g ON g.transaction_id = t.id "
                "WHERE g.label = 1 ORDER BY t.occurred_at LIMIT 1"
            )
        ).one()
        columns = (
            conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'transactions'"
                )
            )
            .scalars()
            .all()
        )
    assert ingestion["source"] == "connection" and ingestion["row_count"] == 25
    assert ingestion["file_name"] == "fake_source.saml"
    assert (sample.sender, float(sample.amount), sample.label) == (9001, 100.0, 1)
    assert (sample.original_typology, sample.typology) == ("Fan-out", "fan_out")
    assert not {"label", "is_laundering", "laundering_type"} & set(columns)

    row = _connection_row(db, connection_id)
    assert row["status"] == "connected" and row["last_position"] == "25"
    assert row["last_synced_at"] is not None and row["last_error"] is None
    queued = [j for j in _all_jobs(db) if j["status"] == "queued"]
    assert [(j["kind"], j["dataset"]) for j in queued] == [("process", "saml-d")]
    assert queued[0]["created_by"] == "Ana"


def _all_jobs(db):
    with db.connect() as conn:
        rows = conn.execute(text("SELECT * FROM public.jobs ORDER BY id")).mappings().all()
        return [dict(r) for r in rows]


def test_import_without_truth_never_creates_ground_truth(db, source_env, allow_connection_source):
    create_source(db, make_rows(12), drop=("Is_laundering", "Laundering_type"))
    job_id = _enqueue_import(db, _connection(db, source_env))
    jobs.process_next_job(db)
    assert _job(db, job_id)["status"] == "done"
    assert _count(db, "transactions") == 12 and _count(db, "ground_truth") == 0
    assert _registry(db)["labels_checked_at"] is None  # sem gabarito, nada a medir


def _registry(db, slug="saml-d") -> dict:
    with db.connect() as conn:
        row = conn.execute(text("SELECT * FROM public.datasets WHERE slug = :s"), {"s": slug})
        return dict(row.mappings().one())


def test_import_with_truth_updates_the_label_summary_in_the_registry(
    db, source_env, allow_connection_source
):
    with db.begin() as conn:
        create_dataset(conn, name="Parceiro", slug="parceiro")
    before = _registry(db, "parceiro")
    assert (before["labeled_weeks"], before["has_laundering"]) == (0, False)
    create_source(db, make_rows(25))
    job_id = _enqueue_import(db, _connection(db, source_env, dataset="parceiro"), "parceiro")
    jobs.process_next_job(db)
    assert _job(db, job_id)["status"] == "done"

    after = _registry(db, "parceiro")
    assert after["labeled_weeks"] >= 1 and after["has_laundering"] is True
    assert after["labels_checked_at"] is not None
    assert _registry(db)["labels_checked_at"] is None  # o outro conjunto não foi tocado


def test_import_into_a_new_dataset_leaves_the_current_one_alone(
    db, source_env, allow_connection_source
):
    with db.begin() as conn:
        create_dataset(conn, name="Parceiro", slug="parceiro")
    create_source(db, make_rows(9))
    connection_id = _connection(db, source_env, dataset="parceiro")
    job_id = _enqueue_import(db, connection_id, dataset="parceiro")
    jobs.process_next_job(db)
    assert _job(db, job_id)["status"] == "done"
    assert _count(db, "transactions", dataset="parceiro") == 9
    assert _count(db, "ground_truth", dataset="parceiro") == 9
    assert _count(db, "transactions") == 0 and _count(db, "ingestions") == 0
    assert _count(db, "ingestions", dataset="parceiro", where="source = 'connection'") == 1


def test_import_extends_the_current_dataset_keeping_existing_rows(
    db, seed, source_env, allow_connection_source
):
    seed.transaction(9001, 9002, datetime(2023, 6, 1, 10, 0), label=0)
    create_source(db, make_rows(6, start=datetime(2023, 6, 13, 8, 0)))
    job_id = _enqueue_import(db, _connection(db, source_env))
    jobs.process_next_job(db)
    assert _job(db, job_id)["status"] == "done"
    assert _count(db, "transactions") == 7 and _count(db, "ground_truth") == 7


def test_import_reports_progress_in_batches(db, source_env, allow_connection_source, monkeypatch):
    monkeypatch.setattr("fraudradar.sources.reader.BATCH_SIZE", 10)
    create_source(db, make_rows(35))
    seen = []
    job_id = _enqueue_import(db, _connection(db, source_env))

    def recording_import(engine, job, progress):
        def record(value, message=None):
            seen.append((value, message))
            progress(value, message)

        jobs.DEFAULT_HANDLERS["import"](engine, job, record)

    handlers = {"import": recording_import}
    jobs.process_next_job(db, handlers)
    assert _job(db, job_id)["status"] == "done"
    values = [value for value, _ in seen]
    assert values == sorted(values) and values[-1] == 95 and len(values) >= 5
    assert any("de 35" in (message or "") for _, message in seen)
    assert _count(db, "transactions") == 35


def test_invalid_source_data_rolls_everything_back_without_leaking_values(
    db, source_env, allow_connection_source
):
    rows = make_rows(20)
    rows[15]["Sender_account"] = 0
    rows[15]["Payment_type"] = "x"
    create_source(db, rows)
    connection_id = _connection(db, source_env)
    job_id = _enqueue_import(db, connection_id)
    jobs.process_next_job(db)
    job = _job(db, job_id)
    assert job["status"] == "failed"
    assert "linha 17" in job["message"] and "Sender_account" in job["message"]
    assert _count(db, "transactions") == 0 and _count(db, "ingestions") == 0
    row = _connection_row(db, connection_id)
    assert row["status"] == "error" and "Dados inválidos" in row["last_error"]


def test_import_fails_cleanly_for_wrong_password_and_missing_key(
    db, source_env, allow_connection_source, monkeypatch
):
    create_source(db, make_rows(3))
    connection_id = _connection(db, source_env, password="errada-mesmo")
    job_id = _enqueue_import(db, connection_id)
    jobs.process_next_job(db)
    job = _job(db, job_id)
    assert job["status"] == "failed" and "errada-mesmo" not in job["message"]
    assert "senha" in job["message"].lower()
    assert _connection_row(db, connection_id)["status"] == "error"

    monkeypatch.setenv("CONNECTIONS_SECRET_KEY", "")
    from fraudradar.config import get_settings

    get_settings.cache_clear()
    job_id = _enqueue_import(db, connection_id)
    jobs.process_next_job(db)
    assert "CONNECTIONS_SECRET_KEY" in _job(db, job_id)["message"]


def test_import_of_an_empty_table_finishes_without_an_ingestion(
    db, source_env, allow_connection_source
):
    create_source(db, [])
    job_id = _enqueue_import(db, _connection(db, source_env))
    jobs.process_next_job(db)
    job = _job(db, job_id)
    assert job["status"] == "done" and _count(db, "ingestions") == 0


# --- acompanhamento ------------------------------------------------------------------------------


def test_pull_registers_itself_as_a_pre_process_hook():
    assert pull_new_rows in jobs.PRE_PROCESS_HOOKS


def test_pull_reads_only_rows_after_the_stored_position(db, source_env, allow_connection_source):
    create_source(db, make_rows(10, start=datetime(2023, 6, 13, 8, 0)))
    connection_id = _connection(db, source_env, mode="follow", position="10")
    pull_new_rows(db, "saml-d")
    assert _count(db, "transactions") == 0  # nada novo desde a posição

    append_rows(db, make_rows(4, start=datetime(2023, 6, 14, 8, 0)))
    pull_new_rows(db, "saml-d")
    assert _count(db, "transactions") == 4 and _count(db, "ground_truth") == 4
    assert _connection_row(db, connection_id)["last_position"] == "14"
    assert _count(db, "ingestions", where="source = 'connection'") == 1

    pull_new_rows(db, "saml-d")  # sem repetir as linhas já lidas
    assert _count(db, "transactions") == 4

    append_rows(db, make_rows(2, start=datetime(2023, 6, 15, 8, 0)))
    pull_new_rows(db, "saml-d")
    assert _count(db, "transactions") == 6
    assert _connection_row(db, connection_id)["last_position"] == "16"


def test_pull_follows_a_timestamp_control_column(db, source_env, allow_connection_source):
    create_source(db, make_rows(5, start=datetime(2023, 6, 13, 8, 0)))
    with db.begin() as conn:
        conn.exec_driver_sql(
            "ALTER TABLE fake_source.saml ADD COLUMN created_at timestamp; "
            "UPDATE fake_source.saml "
            "SET created_at = timestamp '2023-06-13 12:00' + id * interval '1 hour'"
        )
    connection_id = _connection(
        db, source_env, mode="follow", control="created_at", position="2023-06-13 14:00:00"
    )
    pull_new_rows(db, "saml-d")
    # created_at = 13:00, 14:00, 15:00, 16:00, 17:00 -> só as 3 depois das 14:00
    assert _count(db, "transactions") == 3
    assert _connection_row(db, connection_id)["last_position"] == "2023-06-13 17:00:00"


def test_pull_skips_connections_that_are_importing_or_not_following(
    db, source_env, allow_connection_source
):
    create_source(db, make_rows(5, start=datetime(2023, 6, 13, 8, 0)))
    _connection(db, source_env, mode="both")  # importação ainda em andamento (syncing)
    _connection(db, source_env, mode="history")
    pull_new_rows(db, "saml-d")
    assert _count(db, "transactions") == 0


def test_pull_runs_for_the_right_dataset_only(db, source_env, allow_connection_source):
    with db.begin() as conn:
        create_dataset(conn, name="Parceiro", slug="parceiro")
    create_source(db, make_rows(5, start=datetime(2023, 6, 13, 8, 0)))
    _connection(db, source_env, dataset="parceiro", mode="follow")
    pull_new_rows(db, "saml-d")
    assert _count(db, "transactions", dataset="parceiro") == 0
    pull_new_rows(db, "parceiro")
    assert _count(db, "transactions", dataset="parceiro") == 5
    assert _count(db, "transactions") == 0


def test_pull_refuses_rows_that_land_in_closed_weeks_and_does_not_break_processing(
    db, seed, source_env, allow_connection_source
):
    seed.transaction(9001, 9002, datetime(2023, 6, 14, 12, 0))  # semana aberta: 12/06
    create_source(db, make_rows(3, start=datetime(2023, 5, 1, 8, 0)))
    connection_id = _connection(db, source_env, mode="follow")
    pull_new_rows(db, "saml-d")  # não levanta: o processamento continua
    assert _count(db, "transactions") == 1
    row = _connection_row(db, connection_id)
    assert row["status"] == "error" and "semana" in row["last_error"]
    assert row["last_position"] is None


def test_pull_records_source_failures_in_the_connection_status(
    db, source_env, allow_connection_source
):
    _connection(db, source_env, mode="follow", table="fake_source.nao_existe")
    pull_new_rows(db, "saml-d")
    with db.connect() as conn:
        status, error = conn.execute(
            text("SELECT status, last_error FROM public.external_connections")
        ).one()
    assert status == "error" and "tabela" in error


@pytest.mark.parametrize("dataset", ["inexistente", "Slug Inválido"])
def test_pull_ignores_unknown_datasets(db, dataset):
    pull_new_rows(db, dataset)


def test_external_reads_are_read_only(db, source_env):
    from fraudradar.sources.connection import ExternalSource, SourceError, open_readonly

    create_source(db, make_rows(2))
    source = ExternalSource(
        source_env["host"],
        source_env["port"],
        source_env["database"],
        source_env["user"],
        source_env["password"],
        "fake_source.saml",
    )
    with pytest.raises(SourceError), open_readonly(source) as conn:
        conn.execute("DELETE FROM fake_source.saml")
    with db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM fake_source.saml")).scalar_one() == 2
