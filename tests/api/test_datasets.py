"""Catálogo, criação e isolamento dos conjuntos de dados na API."""

from datetime import date

from sqlalchemy import text

from fraudradar.datasets import resolve_dataset, use_dataset

WEEK = date(2023, 5, 22)


def _create_external(client):
    response = client.post("/datasets", json={"name": "Base externa", "slug": "base-externa"})
    assert response.status_code == 201, response.text
    return response.json()


def _seed_external_alert(db) -> int:
    with db.begin() as conn:
        dataset = resolve_dataset(conn, "base-externa")
        use_dataset(conn, dataset)
        conn.execute(
            text(
                "INSERT INTO model_versions (version, features, threshold, active) "
                "VALUES ('external-v1', '[]'::jsonb, 0.5, true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO accounts (account, first_seen_at, last_seen_at) "
                "VALUES (9001, '2023-05-22', '2023-05-22')"
            )
        )
        return conn.execute(
            text(
                "INSERT INTO alerts "
                "(account, week, score, queue_position, countries, model_version) "
                "VALUES (9001, :week, 0.95, 1, ARRAY['UK'], 'external-v1') RETURNING id"
            ),
            {"week": WEEK},
        ).scalar_one()


def test_get_and_post_datasets_create_schema_and_audit(client, db):
    assert [item["slug"] for item in client.get("/datasets").json()] == ["saml-d"]
    created = _create_external(client)
    assert created["origin"] == "external"
    assert created["active_model_version"] is None
    with db.connect() as conn:
        assert (
            conn.execute(
                text("SELECT schema_name FROM public.datasets WHERE slug = 'base-externa'")
            ).scalar_one()
            == "ds_base_externa"
        )
        assert (
            conn.execute(
                text(
                    "SELECT action FROM public.audit_log "
                    "WHERE entity = 'dataset' AND entity_id = 'base-externa'"
                )
            ).scalar_one()
            == "dataset_created"
        )
        assert (
            conn.execute(text("SELECT to_regclass('ds_base_externa.alerts')")).scalar_one()
            == "ds_base_externa.alerts"
        )


def test_dataset_header_isolates_existing_data_routes(client, db, seed):
    public_id = seed.alert(101, WEEK)
    _create_external(client)
    external_id = _seed_external_alert(db)

    public_queue = client.get("/alerts", params={"week": WEEK.isoformat()})
    external_queue = client.get(
        "/alerts",
        params={"week": WEEK.isoformat()},
        headers={"X-Dataset": "base-externa"},
    )
    assert public_queue.status_code == external_queue.status_code == 200
    assert [item["id"] for item in public_queue.json()["items"]] == [str(public_id)]
    assert [item["id"] for item in external_queue.json()["items"]] == [str(external_id)]


def test_unknown_dataset_is_404_on_data_route(client):
    response = client.get("/weeks", headers={"X-Dataset": "desconhecido"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Conjunto de dados 'desconhecido' não encontrado."


def test_process_enqueues_job_and_jobs_can_be_filtered(client, db):
    _create_external(client)
    response = client.post("/datasets/base-externa/process")
    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "queued"
    assert job["progress"] == 0
    assert client.get(f"/jobs/{job['id']}").json() == job
    listed = client.get("/jobs", params={"dataset": "base-externa"}).json()
    assert [item["id"] for item in listed] == [job["id"]]
    assert client.get("/jobs", params={"dataset": "ausente"}).status_code == 404
    with db.begin() as conn:
        dataset = resolve_dataset(conn, "base-externa")
        use_dataset(conn, dataset)
        assert (
            conn.execute(text("SELECT action FROM audit_log WHERE entity = 'job'")).scalar_one()
            == "process_enqueued"
        )


def test_duplicate_dataset_is_conflict(client):
    _create_external(client)
    response = client.post("/datasets", json={"name": "Outra", "slug": "base-externa"})
    assert response.status_code == 409
