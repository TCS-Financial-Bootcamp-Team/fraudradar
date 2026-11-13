"""Troca de idioma: mensagens do servidor com código e parâmetros (``AppError``, jobs, ficha)."""

import json
import re
from datetime import date
from pathlib import Path

from sqlalchemy import text

from api.errors import AppError
from fraudradar.config import ROOT_DIR, get_settings
from fraudradar.messages import Msg, msg
from fraudradar.model.eligibility import block_message, block_reason
from fraudradar.model.feedback import LabelCounts, feedback_block_message
from fraudradar.model.training import promotion_gate
from fraudradar.sources.compatibility import suggest
from worker.errors import WorkerError
from worker.jobs import process_next_job


def test_app_error_response_has_detail_code_and_params(client):
    response = client.get("/alerts/999999")
    assert response.status_code == 404
    body = response.json()
    assert body == {
        "detail": "Alerta 999999 não encontrado.",
        "code": "alert.not_found",
        "params": {"id": 999999},
    }


def test_unknown_dataset_header_is_a_coded_404(client):
    response = client.get("/alerts", headers={"X-Dataset": "nao-existe"})
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "dataset.not_found"
    assert body["params"] == {"slug": "nao-existe"}
    assert body["detail"] == "Conjunto de dados 'nao-existe' não encontrado."


def test_errors_that_are_not_converted_keep_only_detail(client):
    # 405 e 422 do FastAPI/Pydantic seguem no formato de sempre, sem `code`.
    missing = client.get("/rota-que-nao-existe")
    assert missing.status_code == 404
    assert set(missing.json()) == {"detail"}
    invalid = client.post("/datasets", json={"name": "", "slug": "Inválido"})
    assert invalid.status_code == 422
    assert "code" not in invalid.json()


def test_app_error_keeps_headers_and_is_an_http_exception():
    from fastapi import HTTPException

    error = AppError(401, "auth.missing", "Sessão ausente.", headers={"WWW-Authenticate": "Bearer"})
    assert isinstance(error, HTTPException)
    assert error.code == "auth.missing"
    assert error.params == {}
    assert error.headers == {"WWW-Authenticate": "Bearer"}


def test_every_screen_facing_error_in_the_api_is_an_app_error():
    """Erro de API que chega à tela nasce como ``AppError`` (com código); ``HTTPException`` solto
    só vale para o que o FastAPI já devolve sozinho."""
    offenders = []
    for path in sorted((ROOT_DIR / "api").rglob("*.py")):
        if path.name == "errors.py":
            continue
        source = path.read_text(encoding="utf-8")
        for number, line in enumerate(source.splitlines(), start=1):
            if re.search(r"\braise HTTPException\(|\breturn HTTPException\(", line):
                offenders.append(f"{path.relative_to(ROOT_DIR)}:{number}")
    assert offenders == []


def test_msg_is_a_str_with_code_and_params():
    message = msg("x.y", "Texto em português", count=3)
    assert isinstance(message, Msg)
    assert message == "Texto em português"
    assert message.text == "Texto em português" and type(message.text) is str
    assert message.code == "x.y"
    assert message.params == {"count": 3}
    assert message.as_fields("reason_") == {"reason_code": "x.y", "reason_params": {"count": 3}}


def test_retrain_block_reasons_carry_codes():
    assert block_message(0, False).code == "retrain.no_labels"
    few = block_message(3, True)
    assert few.code == "retrain.few_weeks"
    assert few.params["weeks"] == 3 and "min_weeks" in few.params
    assert block_message(30, False).code == "retrain.no_laundering"
    assert block_message(30, True) is None
    # O texto em português continua o de sempre.
    assert block_reason(0, False) == (
        "Este conjunto não tem gabarito: o retreino só é possível com transações rotuladas."
    )

    counts = LabelCounts()
    few_labels = feedback_block_message(counts, include_simulated=False)
    assert few_labels.code == "retrain.feedback_few_labels"
    assert few_labels.params["scope"] == "analysts"
    both = feedback_block_message(counts, include_simulated=True)
    assert both.params["scope"] == "analysts_and_simulated"


def test_promotion_gate_has_code_and_params_next_to_the_text():
    blocked = promotion_gate({"queue_recall": 0.90}, {"queue_recall": 0.95}, "lightgbm_v1")
    assert blocked["passed"] is False
    assert blocked["reason_code"] == "model.gate_blocked"
    assert blocked["reason_params"]["gap_pp"] == 5.0
    assert blocked["reason_params"]["active_version"] == "lightgbm_v1"
    assert blocked["reason"].startswith("Bloqueada: acha 5,0 p.p.")
    passed = promotion_gate({"queue_recall": 0.95}, {"queue_recall": 0.95}, "lightgbm_v1")
    assert passed["reason_code"] == "model.gate_passed"
    unknown = promotion_gate({"queue_recall": None}, {"queue_recall": 0.95}, "lightgbm_v1")
    assert unknown["reason_code"] == "model.gate_no_laundering"


def test_compatibility_suggestions_carry_codes():
    assert suggest(False, None, False)["code"] == "compat.suggest_fix"
    assert suggest(True, None, False)["code"] == "compat.suggest_no_data"
    extend = suggest(True, {"dates": "continue", "known_accounts_pct": 80.0}, False)
    assert extend["relation"] == "extend"
    assert extend["code"] == "compat.suggest_extend"
    assert extend["params"] == {"pct": 80.0}
    assert "80% das contas" in extend["message"]
    uncertain = suggest(True, {"dates": "continue", "known_accounts_pct": 30.0}, False)
    assert uncertain["code"] == "compat.suggest_uncertain"


def test_promote_blocked_by_the_gate_answers_with_the_gate_code(client, db):
    root = Path(get_settings().model_dir)
    folder = root / "saml-d"
    folder.mkdir(parents=True)
    (root / "lightgbm_v1.txt").write_text("modelo", encoding="utf-8")
    (root / "lightgbm_v1.json").write_text(
        json.dumps({"version": 1, "file": "lightgbm_v1.txt", "metrics": {}}), encoding="utf-8"
    )
    gate = promotion_gate({"queue_recall": 0.80}, {"queue_recall": 0.95}, "lightgbm_v1")
    (folder / "lightgbm_v2.txt").write_text("modelo", encoding="utf-8")
    (folder / "lightgbm_v2.json").write_text(
        json.dumps(
            {
                "version": 2,
                "file": "lightgbm_v2.txt",
                "metrics": {},
                "comparison": {
                    "active_version": "lightgbm_v1",
                    "period": {"start": None, "end": None, "weeks": 0},
                    "candidate": {},
                    "active": {},
                    "recall_difference": -0.15,
                    "tolerance": 0.01,
                    "gate": gate,
                },
            }
        ),
        encoding="utf-8",
    )
    listing = client.get("/datasets/saml-d/models").json()
    version = next(v for v in listing["versions"] if v["version"] == "saml-d/v2")
    assert version["comparison"]["gate"]["reason_code"] == "model.gate_blocked"
    assert version["comparison"]["gate"]["reason_params"]["limit_pp"] == 1

    refused = client.post("/datasets/saml-d/models/saml-d%2Fv2/promote")
    assert refused.status_code == 409
    body = refused.json()
    assert body["code"] == "model.gate_blocked"
    assert body["detail"] == gate["reason"]
    assert body["params"]["active_version"] == "lightgbm_v1"


def test_train_blocked_listing_exposes_code_and_params(client, db):
    listing = client.get("/datasets/saml-d/models").json()
    assert listing["can_train"] is False
    assert listing["train_blocked_reason_code"] == "retrain.no_labels"
    assert listing["training_feedback"]["blocked_reason_code"] == "retrain.no_labels"
    refused = client.post("/datasets/saml-d/train")
    assert refused.status_code == 409
    assert refused.json()["code"] == "retrain.no_labels"
    assert refused.json()["detail"] == listing["train_blocked_reason"]


def test_feedback_summary_exposes_the_retrain_reason_code(client, db):
    retrain = client.get("/feedback/summary").json()["retrain"]
    assert retrain["can_retrain"] is False
    assert retrain["reason_code"] == "retrain.no_labels"
    assert retrain["reason_params"] == {}


def test_weekly_series_carry_the_iso_week_next_to_the_label(client, seed):
    seed.batch(date(2023, 1, 2))
    seed.alert(1, date(2023, 1, 2), status="new")
    body = client.get("/monitoring", params={"week": "2023-01-02"}).json()
    assert body["weeks"] == [{"name": "02 jan", "value": 1.0, "week": "2023-01-02"}]
    # as séries que não são semanais seguem sem a data
    assert all("week" not in point for point in body["score_histogram"])


def _enqueue(db, kind="process") -> int:
    with db.begin() as conn:
        return conn.execute(
            text(
                "INSERT INTO public.jobs (kind, dataset, created_by)"
                " VALUES (:kind, 'saml-d', 'Teste') RETURNING id"
            ),
            {"kind": kind},
        ).scalar_one()


def _job_row(db, job_id: int) -> dict:
    with db.connect() as conn:
        return dict(
            conn.execute(text("SELECT * FROM public.jobs WHERE id = :id"), {"id": job_id})
            .mappings()
            .one()
        )


def test_job_progress_and_final_message_fill_code_and_params(db, client):
    job_id = _enqueue(db)
    seen = {}

    def handler(engine, job, progress):
        progress(40, msg("job.process_preparing", "Preparando."))
        seen["mid"] = _job_row(engine, job.id)
        return msg("job.process_done", "Concluído: 2 período(s).", count=2)

    assert process_next_job(db, {"process": handler}) is True
    mid = seen["mid"]
    assert mid["message"] == "Preparando."
    assert mid["message_code"] == "job.process_preparing"
    final = _job_row(db, job_id)
    assert final["status"] == "done"
    assert final["message"] == "Concluído: 2 período(s)."
    assert final["message_code"] == "job.process_done"
    assert final["message_params"] == {"count": 2}
    # A API entrega os dois campos novos ao lado do texto de sempre.
    api_job = client.get(f"/jobs/{job_id}").json()
    assert api_job["message"] == "Concluído: 2 período(s)."
    assert api_job["message_code"] == "job.process_done"
    assert api_job["message_params"] == {"count": 2}


def test_plain_text_message_has_no_code(db):
    job_id = _enqueue(db)

    def handler(engine, job, progress):
        progress(10, "texto sem código")
        return "final sem código"

    process_next_job(db, {"process": handler})
    row = _job_row(db, job_id)
    assert row["message"] == "final sem código"
    assert row["message_code"] is None
    assert row["message_params"] is None


def test_worker_error_with_a_code_fails_the_job_with_the_code(db):
    job_id = _enqueue(db, kind="train")
    process_next_job(db)  # conjunto sem gabarito: o treino recusa
    row = _job_row(db, job_id)
    assert row["status"] == "failed"
    assert row["message_code"] == "retrain.no_labels"
    assert row["message_params"] is None or row["message_params"] == {}

    other = _enqueue(db)

    def handler(engine, job, progress):
        raise WorkerError("Motivo em português", "demo.motivo", {"n": 1})

    process_next_job(db, {"process": handler})
    failed = _job_row(db, other)
    assert failed["message"] == "Motivo em português"
    assert failed["message_code"] == "demo.motivo"
    assert failed["message_params"] == {"n": 1}


def test_claiming_and_generic_failure_use_codes(db):
    job_id = _enqueue(db)

    def handler(engine, job, progress):
        assert _job_row(engine, job.id)["message_code"] == "job.started"
        raise RuntimeError("falha interna")

    process_next_job(db, {"process": handler})
    row = _job_row(db, job_id)
    assert row["status"] == "failed"
    assert row["message_code"] == "job.failed_generic"
    assert "logs do worker" in row["message"]


def test_upgrade_007_is_idempotent_and_keeps_the_jobs(db):
    job_id = _enqueue(db)
    script = (ROOT_DIR / "db" / "upgrades" / "007_i18n.sql").read_text(encoding="utf-8")
    with db.begin() as conn:  # volta ao esquema de antes do 007
        conn.exec_driver_sql(
            "ALTER TABLE public.jobs DROP COLUMN message_code, DROP COLUMN message_params"
        )

    def columns() -> set[str]:
        with db.connect() as conn:
            return set(
                conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns"
                        " WHERE table_schema = 'public' AND table_name = 'jobs'"
                    )
                ).scalars()
            )

    assert not {"message_code", "message_params"} & columns()
    for _ in range(2):  # duas vezes: o segundo passo não pode falhar nem mudar nada
        with db.begin() as conn:
            conn.exec_driver_sql(script)
        assert {"message_code", "message_params"} <= columns()
    with db.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM public.jobs WHERE id = :id"), {"id": job_id}
            ).scalar_one()
            == 1
        )
        row = conn.execute(
            text("SELECT message_code, message_params FROM public.jobs WHERE id = :id"),
            {"id": job_id},
        ).one()
    assert row.message_code is None and row.message_params is None
