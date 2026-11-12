"""Fila persistente do ``worker serve``."""

from sqlalchemy import text

from fraudradar.datasets import create_dataset, use_dataset
from worker.batch import RunResult
from worker.jobs import process_next_job, recover_stale_jobs, schedule_due_process_jobs


def _enqueue(db, *, kind="process", dataset="saml-d") -> int:
    with db.begin() as conn:
        return conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, created_by) "
                "VALUES (:kind, :dataset, 'Teste') RETURNING id"
            ),
            {"kind": kind, "dataset": dataset},
        ).scalar_one()


def _job(db, job_id):
    with db.connect() as conn:
        return dict(
            conn.execute(text("SELECT * FROM public.jobs WHERE id = :id"), {"id": job_id})
            .mappings()
            .one()
        )


def test_serve_claims_and_finishes_only_one_job_per_iteration(db):
    first = _enqueue(db)
    second = _enqueue(db)
    seen = []

    def handler(engine, job, progress):
        seen.append(job.id)
        progress(50, "Metade concluída.")
        assert _job(engine, second)["status"] == "queued"

    assert process_next_job(db, {"process": handler}) is True
    assert seen == [first]
    assert _job(db, first)["status"] == "done"
    assert _job(db, first)["progress"] == 100
    assert _job(db, second)["status"] == "queued"


def test_failure_is_recorded_without_traceback_in_the_user_message(db):
    job_id = _enqueue(db, kind="train")
    process_next_job(db)
    row = _job(db, job_id)
    assert row["status"] == "failed"
    assert row["message"] == (
        "Este conjunto não tem gabarito: o retreino só é possível com transações rotuladas."
    )
    assert row["finished_at"] is not None


def test_process_job_resolves_and_runs_on_the_registered_schema(db, monkeypatch):
    with db.begin() as conn:
        dataset = create_dataset(conn, name="Base do worker", slug="worker-base")
        use_dataset(conn, dataset)
        conn.execute(
            text(
                "INSERT INTO audit_log (actor, action, entity) "
                "VALUES ('Teste', 'schema_marker', 'test')"
            )
        )
    job_id = _enqueue(db, dataset="worker-base")
    observed = {}

    def fake_continuous(engine, *, dataset, **_options):
        with engine.connect() as conn:
            use_dataset(conn, dataset)
            observed["schema"] = conn.execute(text("SELECT current_schema()")).scalar_one()
            observed["markers"] = conn.execute(
                text("SELECT count(*) FROM audit_log WHERE action = 'schema_marker'")
            ).scalar_one()
        return RunResult()

    monkeypatch.setattr("worker.batch.run_continuous", fake_continuous)
    process_next_job(db)
    assert _job(db, job_id)["status"] == "done"
    assert observed == {"schema": "ds_worker_base", "markers": 1}


def test_scheduler_enqueues_a_due_dataset_only_once(db):
    with db.begin() as conn:
        conn.execute(
            text(
                "UPDATE public.processing_settings SET next_run_at = now() - interval '1 minute'"
                " WHERE dataset = 'saml-d'"
            )
        )
    assert schedule_due_process_jobs(db) == 1
    assert schedule_due_process_jobs(db) == 0
    with db.connect() as conn:
        assert (
            conn.execute(
                text(
                    "SELECT count(*) FROM public.jobs WHERE dataset = 'saml-d'"
                    " AND kind = 'process' AND status = 'queued'"
                )
            ).scalar_one()
            == 1
        )


def test_stale_running_job_is_failed(db):
    with db.begin() as conn:
        job_id = conn.execute(
            text(
                "INSERT INTO public.jobs"
                " (kind, dataset, status, progress, message, created_by, started_at)"
                " VALUES ('process', 'saml-d', 'running', 42, 'Em curso', 'Teste',"
                " now() - interval '3 hours') RETURNING id"
            )
        ).scalar_one()
    assert recover_stale_jobs(db) == 1
    row = _job(db, job_id)
    assert (row["status"], row["progress"], row["message"]) == (
        "failed",
        0,
        "Trabalho interrompido",
    )


def test_simulator_job_creates_one_flagged_ingestion_without_ground_truth(loaded):
    with loaded.begin() as conn:
        last_before = conn.execute(text("SELECT max(occurred_at) FROM transactions")).scalar_one()
        truth_before = conn.execute(text("SELECT count(*) FROM ground_truth")).scalar_one()
        job_id = conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by)"
                " VALUES ('simulate', 'saml-d',"
                ' \'{"transactions": 50, "days": 2, "inject_pattern": true}\'::jsonb,'
                " 'Teste') RETURNING id"
            )
        ).scalar_one()

    assert process_next_job(loaded) is True
    assert _job(loaded, job_id)["status"] == "done"
    with loaded.connect() as conn:
        ingestion = (
            conn.execute(
                text("SELECT id, source, row_count FROM ingestions WHERE source = 'simulation'")
            )
            .mappings()
            .one()
        )
        simulated = (
            conn.execute(
                text(
                    "SELECT count(*) AS count, min(occurred_at) AS first_at,"
                    " bool_and(sender IN (SELECT account FROM accounts)) AS senders_exist,"
                    " bool_and(receiver IN (SELECT account FROM accounts)) AS receivers_exist"
                    " FROM transactions WHERE ingestion_id = :id"
                ),
                {"id": ingestion["id"]},
            )
            .mappings()
            .one()
        )
        assert dict(ingestion) == {
            "id": ingestion["id"],
            "source": "simulation",
            "row_count": 50,
        }
        assert simulated["count"] == 50
        assert simulated["first_at"].date() > last_before.date()
        assert simulated["senders_exist"] and simulated["receivers_exist"]
        assert conn.execute(text("SELECT count(*) FROM ground_truth")).scalar_one() == truth_before
        assert (
            conn.execute(
                text(
                    "SELECT count(*) FROM public.jobs WHERE kind = 'process'"
                    " AND status = 'queued' AND dataset = 'saml-d'"
                )
            ).scalar_one()
            == 1
        )


def test_simulator_job_without_the_pattern_only_repeats_existing_pairs(loaded):
    with loaded.begin() as conn:
        last_id = conn.execute(text("SELECT max(id) FROM transactions")).scalar_one()
        conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, payload, created_by)"
                " VALUES ('simulate', 'saml-d',"
                ' \'{"transactions": 300, "days": 3, "inject_pattern": false}\'::jsonb,'
                " 'Teste')"
            )
        )

    assert process_next_job(loaded) is True
    with loaded.connect() as conn:
        simulated, new_pairs = conn.execute(
            text(
                "SELECT count(*), count(*) FILTER (WHERE NOT EXISTS ("
                "   SELECT 1 FROM transactions old WHERE old.id <= :last"
                "   AND old.sender = sim.sender AND old.receiver = sim.receiver))"
                " FROM transactions sim WHERE sim.id > :last"
            ),
            {"last": last_id},
        ).one()
    assert (simulated, new_pairs) == (300, 0)
