"""Fila persistente do ``worker serve``."""

from sqlalchemy import text

from fraudradar.datasets import create_dataset, use_dataset
from worker.batch import RunResult
from worker.jobs import process_next_job


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
    assert row["message"] == "Treino ainda não implementado nesta fase."
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

    def fake_replay(engine, *, dataset, **_options):
        with engine.connect() as conn:
            use_dataset(conn, dataset)
            observed["schema"] = conn.execute(text("SELECT current_schema()")).scalar_one()
            observed["markers"] = conn.execute(
                text("SELECT count(*) FROM audit_log WHERE action = 'schema_marker'")
            ).scalar_one()
        return RunResult()

    monkeypatch.setattr("worker.batch.run_replay", fake_replay)
    process_next_job(db)
    assert _job(db, job_id)["status"] == "done"
    assert observed == {"schema": "ds_worker_base", "markers": 1}
