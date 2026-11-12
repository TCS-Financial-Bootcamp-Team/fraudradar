"""Conexões com bancos externos: cadastro, teste de compatibilidade e as duas perguntas.

A fonte é um schema ``fake_source`` dentro do próprio banco de teste (nome terminado em
``_test``), cadastrado como se fosse um servidor externo.
"""

import json
import logging
from datetime import datetime

import external_source
import pytest
from external_source import create_source, make_rows
from sqlalchemy import text

PASSWORD_MARK = "senha-que-nunca-sai"

# fixtures compartilhadas com tests/worker/test_import_job.py
source_env = external_source.source_env
allow_connection_source = external_source.allow_connection_source


def _body(env, table="fake_source.saml", **extra):
    return {
        "name": "Fonte de teste",
        "host": env["host"],
        "port": env["port"],
        "database": env["database"],
        "user": env["user"],
        "password": env["password"],
        "table": table,
        "control_column": "id",
        **extra,
    }


def _create(client, env, **extra) -> dict:
    response = client.post("/ingestion/connections", json=_body(env, **extra))
    assert response.status_code == 201, response.text
    return response.json()


def _seed_current_dataset(seed, *, last_day=datetime(2023, 6, 14, 12, 0)):
    """O conjunto atual (saml-d de teste) com contas que a fonte também usa."""
    seed.transaction(9001, 9002, datetime(2023, 1, 2, 9, 0))
    seed.transaction(9003, 9004, last_day)
    seed.transaction(7777, 7778, last_day)


# --- cadastro ------------------------------------------------------------------------------------


def test_create_list_and_delete_never_return_the_password(client, source_env, caplog, db):
    caplog.set_level(logging.DEBUG)
    created = client.post("/ingestion/connections", json=_body(source_env, password=PASSWORD_MARK))
    assert created.status_code == 201
    payload = created.json()
    assert payload["status"] == "untested" and payload["masked_host"].endswith("•••")
    listing = client.get("/ingestion/connections")
    for text_out in (created.text, listing.text):
        assert PASSWORD_MARK not in text_out and "password" not in text_out.lower()
    with db.connect() as conn:
        stored = conn.execute(text("SELECT password_encrypted FROM public.external_connections"))
        encrypted = stored.scalar_one()
        audit = conn.execute(text("SELECT details::text FROM public.audit_log")).scalars().all()
    assert PASSWORD_MARK not in encrypted and encrypted.startswith("gAAAA")
    assert all(PASSWORD_MARK not in entry for entry in audit)
    assert PASSWORD_MARK not in caplog.text
    assert client.delete(f"/ingestion/connections/{payload['id']}").status_code == 204
    assert client.get("/ingestion/connections").json() == {"items": []}
    assert client.delete(f"/ingestion/connections/{payload['id']}").status_code == 404


def test_validation_errors_never_echo_the_password(client, source_env):
    body = _body(source_env, password=PASSWORD_MARK, unknown=1)
    del body["table"]
    response = client.post("/ingestion/connections", json=body)
    assert response.status_code == 422
    assert PASSWORD_MARK not in response.text and '"input"' not in response.text
    assert any(error["loc"] == ["body", "table"] for error in response.json()["detail"])


def test_create_refuses_to_save_without_secret_key(client, source_env, monkeypatch, db):
    monkeypatch.setenv("CONNECTIONS_SECRET_KEY", "")
    from fraudradar.config import get_settings

    get_settings.cache_clear()
    response = client.post("/ingestion/connections", json=_body(source_env))
    assert response.status_code == 503
    assert "CONNECTIONS_SECRET_KEY" in response.json()["detail"]
    with db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM public.external_connections")).scalar() == 0


def test_create_refuses_hosts_outside_the_allow_list(client, source_env, monkeypatch):
    response = client.post("/ingestion/connections", json=_body(source_env, host="169.254.169.254"))
    assert response.status_code == 422 and "EXTERNAL_DB_ALLOWED_HOSTS" in response.json()["detail"]
    monkeypatch.setenv("EXTERNAL_DB_ALLOWED_HOSTS", "")
    from fraudradar.config import get_settings

    get_settings.cache_clear()
    assert client.post("/ingestion/connections", json=_body(source_env)).status_code == 422


@pytest.mark.parametrize(
    "extra",
    [
        {"table": "saml; DROP TABLE x"},
        {"table": 'a"b'},
        {"table": "a.b.c"},
        {"control_column": "id; select 1"},
        {"control_column": 'id"'},
        {"port": 70000},
        {"unknown": 1},
    ],
)
def test_create_validates_identifiers_and_fields(client, source_env, extra):
    assert client.post("/ingestion/connections", json=_body(source_env, **extra)).status_code == 422


# --- teste de compatibilidade --------------------------------------------------------------------


def test_compatible_source_report_with_overlap_and_suggestion(client, source_env, seed, db):
    create_source(db, make_rows(30, start=datetime(2023, 6, 15, 8, 0)))
    _seed_current_dataset(seed)
    connection = _create(client, source_env)
    response = client.post(f"/ingestion/connections/{connection['id']}/test")
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["compatible"] is True
    assert {c["key"]: c["status"] for c in report["checks"]} == {
        "connection": "ok",
        "table": "ok",
        "columns": "ok",
        "types": "ok",
        "control": "ok",
        "sample": "ok",
        "ground_truth": "info",
    }
    assert report["has_ground_truth"] is True and report["has_typology"] is True
    assert report["row_count"] == 30
    assert report["date_first"] == "2023-06-15" and report["date_last"] == "2023-06-16"
    assert report["sample"] == {"size": 30, "valid": True, "errors": []}
    overlap = report["overlap"]
    assert overlap["dataset"] == "saml-d" and overlap["dates"] == "continue"
    assert overlap["sample_accounts"] == 4 and overlap["known_accounts_pct"] == 100.0
    assert report["suggestion"]["relation"] == "extend"
    assert PASSWORD_MARK not in json.dumps(report)
    stored = client.get("/ingestion/connections").json()["items"][0]
    assert stored["status"] == "connected" and stored["compatibility"]["compatible"] is True


def test_report_suggests_a_new_dataset_for_other_accounts_and_era(client, source_env, seed, db):
    rows = make_rows(10, start=datetime(2019, 1, 7, 8, 0), accounts=(555001, 555002, 555003))
    create_source(db, rows)
    _seed_current_dataset(seed)
    connection = _create(client, source_env)
    report = client.post(f"/ingestion/connections/{connection['id']}/test").json()
    assert report["overlap"]["known_accounts_pct"] == 0.0
    assert report["overlap"]["dates"] == "other_era"
    assert report["suggestion"]["relation"] == "new_dataset"


def test_report_says_when_the_source_looks_like_the_loaded_base(client, source_env, seed, db):
    # As mesmas contas e datas dentro das do conjunto atual: uma cópia do que já está carregado.
    create_source(db, make_rows(30, start=datetime(2023, 3, 6, 8, 0)))
    _seed_current_dataset(seed)
    connection = _create(client, source_env)
    report = client.post(f"/ingestion/connections/{connection['id']}/test").json()
    assert report["overlap"]["known_accounts_pct"] == 100.0
    assert report["overlap"]["dates"] == "overlap"
    assert report["suggestion"]["relation"] == "new_dataset"
    assert "parece ser a mesma base já carregada" in report["suggestion"]["message"]
    assert "importar duplicaria transações" in report["suggestion"]["message"]


def test_report_flags_missing_columns_and_wrong_types(client, source_env, db):
    # tabela vazia: só o catálogo importa (boolean/date não aceitariam os valores de teste)
    create_source(
        db,
        [],
        drop=("Payment_type", "Is_laundering", "Laundering_type"),
        types={"Amount": "boolean", "Sender_account": "date"},
    )
    connection = _create(client, source_env)
    report = client.post(f"/ingestion/connections/{connection['id']}/test").json()
    assert report["compatible"] is False
    assert report["missing_columns"] == ["Payment_type"]
    assert {w["column"] for w in report["wrong_types"]} == {"Amount", "Sender_account"}
    assert report["has_ground_truth"] is False
    statuses = {c["key"]: c["status"] for c in report["checks"]}
    assert statuses["columns"] == "fail" and statuses["types"] == "fail"
    assert report["suggestion"]["relation"] is None
    assert client.get("/ingestion/connections").json()["items"][0]["status"] == "incompatible"


def test_report_without_ground_truth_and_with_lowercase_columns(client, source_env, db):
    create_source(db, make_rows(8), drop=("Is_laundering", "Laundering_type"), lowercase=True)
    connection = _create(client, source_env)
    report = client.post(f"/ingestion/connections/{connection['id']}/test").json()
    assert report["compatible"] is True
    assert report["has_ground_truth"] is False and report["has_typology"] is False


def test_report_validates_the_sample_with_the_csv_rules(client, source_env, db):
    rows = make_rows(6)
    rows[2]["Sender_account"] = 0  # a conta não pode ser zero (nem ter zero à esquerda)
    rows[4]["Amount"] = -5
    create_source(db, rows)
    connection = _create(client, source_env)
    report = client.post(f"/ingestion/connections/{connection['id']}/test").json()
    assert report["compatible"] is False
    assert report["sample"]["valid"] is False
    columns = {(e["line"], e["column"]) for e in report["sample"]["errors"]}
    assert (3, "Sender_account") in columns and (5, "Amount") in columns


def test_report_for_missing_table_wrong_password_and_down_server(client, source_env, db):
    create_source(db, make_rows(3))
    missing = _create(client, source_env, table="fake_source.nao_existe")
    report = client.post(f"/ingestion/connections/{missing['id']}/test").json()
    assert report["compatible"] is False
    assert [c["key"] for c in report["checks"]] == ["connection", "table"]
    assert report["checks"][1]["status"] == "fail"

    wrong = _create(client, source_env, password=PASSWORD_MARK)
    report = client.post(f"/ingestion/connections/{wrong['id']}/test").json()
    assert report["compatible"] is False and report["checks"][0]["status"] == "fail"
    assert PASSWORD_MARK not in json.dumps(report)

    down = _create(client, source_env, port=1)
    report = client.post(f"/ingestion/connections/{down['id']}/test").json()
    assert report["checks"][0]["status"] == "fail"
    assert "host, porta e rede" in report["checks"][0]["detail"]


def test_test_endpoint_is_404_for_unknown_connection(client, source_env):
    assert client.post("/ingestion/connections/999/test").status_code == 404


# --- as duas perguntas ---------------------------------------------------------------------------


def _import(client, connection, **body):
    payload = {"relation": "extend", "mode": "history", "control_column": "id", **body}
    return client.post(f"/ingestion/connections/{connection['id']}/import", json=payload)


def _jobs(db):
    with db.connect() as conn:
        return [
            dict(r) for r in conn.execute(text("SELECT * FROM public.jobs ORDER BY id")).mappings()
        ]


def test_extend_history_queues_import_and_marks_the_connection(
    client, source_env, seed, db, allow_connection_source
):
    create_source(db, make_rows(10, start=datetime(2023, 6, 13, 8, 0)))
    _seed_current_dataset(seed)
    connection = _create(client, source_env)
    response = _import(client, connection)
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["dataset"] == "saml-d" and body["job"]["kind"] == "import"
    jobs = _jobs(db)
    assert [j["kind"] for j in jobs] == ["import"]
    assert jobs[0]["payload"] == {"connection_id": int(connection["id"]), "mode": "history"}
    item = client.get("/ingestion/connections").json()["items"][0]
    assert item["status"] == "syncing" and item["dataset"] == "saml-d" and item["mode"] == "history"
    assert _import(client, connection).status_code == 409
    assert client.delete(f"/ingestion/connections/{connection['id']}").status_code == 409


def test_extend_with_dates_in_closed_weeks_is_refused(client, source_env, seed, db):
    create_source(db, make_rows(10, start=datetime(2023, 5, 1, 8, 0)))
    _seed_current_dataset(seed)  # semana aberta: segunda 12/06/2023
    connection = _create(client, source_env)
    response = _import(client, connection)
    assert response.status_code == 422
    assert "semana" in response.json()["detail"]
    assert _jobs(db) == []
    assert client.get("/ingestion/connections").json()["items"][0]["dataset"] is None


def test_extend_follow_only_is_not_blocked_by_old_dates(client, source_env, seed, db):
    create_source(db, make_rows(10, start=datetime(2023, 5, 1, 8, 0)))
    _seed_current_dataset(seed)
    connection = _create(client, source_env)
    response = _import(client, connection, mode="follow")
    assert response.status_code == 202
    assert response.json()["job"]["kind"] == "process"
    with db.connect() as conn:
        row = conn.execute(
            text("SELECT last_position, status, mode FROM public.external_connections")
        ).one()
    assert row.last_position == "10" and row.status == "connected" and row.mode == "follow"


def test_new_dataset_is_created_and_the_current_one_is_untouched(
    client, source_env, seed, db, allow_connection_source
):
    create_source(db, make_rows(10, start=datetime(2019, 1, 7, 8, 0)))
    _seed_current_dataset(seed)
    connection = _create(client, source_env)
    response = _import(
        client,
        connection,
        relation="new_dataset",
        mode="both",
        new_dataset={"name": "Banco do parceiro", "slug": "parceiro"},
    )
    assert response.status_code == 202, response.text
    assert response.json()["dataset"] == "parceiro"
    datasets = {d["slug"]: d for d in client.get("/datasets").json()}
    assert datasets["parceiro"]["origin"] == "external"
    assert _jobs(db)[0]["dataset"] == "parceiro"
    assert seed.count("transactions") == 3
    again = _import(
        client,
        _create(client, source_env),
        relation="new_dataset",
        new_dataset={"name": "Outro", "slug": "parceiro"},
    )
    assert again.status_code == 409


def test_import_request_validation(client, source_env, db):
    create_source(db, make_rows(3))
    connection = _create(client, source_env)
    cases = [
        {"relation": "new_dataset"},
        {"relation": "extend", "new_dataset": {"name": "x", "slug": "x"}},
        {"mode": "tudo"},
        {"relation": "new_dataset", "new_dataset": {"name": "Ok", "slug": "Slug Inválido"}},
        {"control_column": "id; DROP"},
        {"control_column": "nao_existe"},
    ]
    for body in cases:
        assert _import(client, connection, **body).status_code == 422, body
    assert _jobs(db) == []
    assert _import(client, {"id": 999}).status_code == 404


def test_import_refuses_incompatible_tables(client, source_env, db):
    create_source(db, make_rows(3), drop=("Payment_type",))
    connection = _create(client, source_env)
    response = _import(client, connection)
    assert response.status_code == 422 and "compatível" in response.json()["detail"]
