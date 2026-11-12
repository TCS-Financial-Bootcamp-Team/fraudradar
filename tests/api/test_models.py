"""Versões do modelo por conjunto: listagem, pedido de retreino e promoção."""

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, text

from fraudradar.config import get_settings
from fraudradar.datasets import create_dataset
from worker.labels import refresh_label_stats


def write_card(folder: Path, version: int, *, pr_auc: float = 0.5, **extra) -> str:
    folder.mkdir(parents=True, exist_ok=True)
    name = f"lightgbm_v{version}"
    (folder / f"{name}.txt").write_text("modelo", encoding="utf-8")
    card = {
        "version": version,
        "created_at": "2026-11-01T10:00:00",
        "file": f"{name}.txt",
        "trees": 12,
        "history_start": "2022-10-07",
        "train_end": "2023-05-21",
        "metrics": {
            "pr_auc": pr_auc,
            "recall_at_fpr": 0.4,
            "f1": float("nan"),
            "queue_with_cut": {"recall": 0.9, "precision": 0.1, "innocents_per_week": 25.5},
        },
        **extra,
    }
    (folder / f"{name}.json").write_text(json.dumps(card), encoding="utf-8")
    return name


def comparison(passed: bool, *, new: float = 0.9, current: float = 0.95) -> dict:
    """O bloco que o worker grava na ficha do retreino (fraudradar.model.training)."""
    return {
        "active_version": "lightgbm_v1",
        "period": {"start": "2023-07-17", "end": "2023-08-21", "weeks": 6},
        "candidate": {
            "pr_auc": 0.8,
            "queue_recall": new,
            "queue_precision": 0.97,
            "innocents_per_week": 3.1,
        },
        "active": {
            "pr_auc": 0.82,
            "queue_recall": current,
            "queue_precision": 0.98,
            "innocents_per_week": 2.2,
        },
        "recall_difference": new - current,
        "tolerance": 0.01,
        "gate": {
            "passed": passed,
            "reason": "Bloqueada: acha 5,0 p.p. menos lavadoras na fila que a versão ativa"
            " (lightgbm_v1) no mesmo período de teste (90,0% contra 95,0%); o limite é 1 p.p."
            if not passed
            else "Acha 95,0% das contas lavadoras na fila, contra 95,0% da versão ativa.",
        },
    }


FEEDBACK_BLOCK = {
    "used": True,
    "include_simulated": True,
    "labels_used": {
        "total": 300,
        "by_class": {"laundering": 120, "false_positive": 180},
        "by_source": {"analyst": 20, "simulated": 280},
        "by_origin": {"model": 290, "exploration": 10},
    },
    "labels_in_validation": 250,
    "labels_reserved_for_test": 0,
    "weight": 3.0,
    "positive_top": 5,
    "transactions_covered": 2000,
    "transactions_weighted": 1900,
    "transactions_without_truth": 0,
    "conflicts": 100,
    "split": {"kind": "feedback"},
}

CLOSED_WEEK = date(2023, 5, 22)
OPEN_WEEK = date(2023, 7, 17)


def feedback_labels(seed, count: int, *, label: int, source: str = "analyst", week=CLOSED_WEEK):
    """`count` alertas decididos com o rótulo que a decisão deixa, numa semana só (SQL em lote).
    Uma transação no período aberto define quais semanas estão fechadas."""
    seed.transaction(1, 2, datetime.combine(OPEN_WEEK, datetime.min.time()))
    seed.model()
    decision = "report" if label == 1 else "archive"
    reason = None if label == 1 else "false_positive"
    first = 10_000 + seed.count("alerts") * 10 + label * 100_000
    seed._exec(
        """
        WITH accounts AS (
            INSERT INTO accounts (account, first_seen_at, last_seen_at)
            SELECT n, '2023-01-01', '2023-08-01'
            FROM generate_series(CAST(:first AS bigint), CAST(:last AS bigint)) n
            ON CONFLICT (account) DO NOTHING
        ), created AS (
            INSERT INTO alerts (account, week, score, queue_position, status, model_version)
            SELECT n, :week, 0.9, n - CAST(:first AS bigint) + 1, :status, 'test-v1'
            FROM generate_series(CAST(:first AS bigint), CAST(:last AS bigint)) n
            RETURNING id, account, week, origin
        ), decided AS (
            INSERT INTO decisions (alert_id, analyst, decision, justification, archive_reason)
            SELECT id, 'Ana', :decision, 'Justificativa em lote.', :reason FROM created
            RETURNING id, alert_id
        )
        INSERT INTO analyst_labels (alert_id, decision_id, account, week, label, origin, source)
        SELECT c.id, d.id, c.account, c.week, :label, c.origin, :source
        FROM decided d JOIN created c ON c.id = d.alert_id
        """,
        first=first,
        last=first + count - 1,
        week=week,
        status="reported" if label == 1 else "archived",
        decision=decision,
        reason=reason,
        label=label,
        source=source,
    )


def label_weeks(seed, weeks: int, *, laundering: bool = True) -> None:
    """Semeia transações rotuladas e roda o que o worker roda: grava o resumo no registro."""
    seed.account(1)
    seed.account(2)
    start = datetime(2023, 1, 2)
    for i in range(weeks):
        seed.transaction(1, 2, start + timedelta(weeks=i), label=1 if laundering and i == 0 else 0)
    refresh_label_stats(seed.engine)


def audit_actions(db) -> list[str]:
    with db.connect() as conn:
        return list(conn.execute(text("SELECT action FROM audit_log ORDER BY id")).scalars())


def test_lists_official_and_own_versions_with_active_flag(client, seed):
    root = Path(get_settings().model_dir)
    write_card(root, 1, pr_auc=0.3)
    write_card(root / "saml-d", 2, pr_auc=0.6)
    label_weeks(seed, 8)

    body = client.get("/datasets/saml-d/models").json()

    assert body["active_version"] == "lightgbm_v1"  # sem versão fixada: o oficial mais novo
    by_name = {v["version"]: v for v in body["versions"]}
    assert by_name["lightgbm_v1"]["source"] == "official"
    assert by_name["lightgbm_v1"]["active"] is True
    assert by_name["saml-d/v2"]["source"] == "dataset"
    assert by_name["saml-d/v2"]["active"] is False
    assert by_name["saml-d/v2"]["metrics"]["pr_auc"] == 0.6
    assert by_name["saml-d/v2"]["metrics"]["f1"] is None  # NaN não vai para o front
    assert by_name["saml-d/v2"]["metrics"]["innocents_per_week"] == 25.5
    assert body["can_train"] is True
    assert body["train_blocked_reason"] is None


def test_dataset_version_never_shares_a_name_with_an_official_one(client, seed):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root, 2)  # o oficial ganhou a v2 depois do retreino do conjunto
    write_card(root / "saml-d", 2)

    versions = client.get("/datasets/saml-d/models").json()["versions"]

    names = [v["version"] for v in versions]
    assert sorted(names) == ["lightgbm_v2", "saml-d/v2"]
    assert {v["version"]: v["source"] for v in versions} == {
        "lightgbm_v2": "official",
        "saml-d/v2": "dataset",
    }


def test_unknown_dataset_is_404(client):
    assert client.get("/datasets/nao-existe/models").status_code == 404
    assert client.post("/datasets/nao-existe/train").status_code == 404
    assert client.post("/datasets/nao-existe/models/lightgbm_v1/promote").status_code == 404


def test_train_is_refused_without_ground_truth(client, db):
    with db.begin() as conn:
        create_dataset(conn, name="Sem gabarito", slug="sem-gabarito")

    listing = client.get("/datasets/sem-gabarito/models").json()
    assert listing["can_train"] is False
    assert "não tem gabarito" in listing["train_blocked_reason"]

    response = client.post("/datasets/sem-gabarito/train")
    assert response.status_code == 409
    assert "não tem gabarito" in response.json()["detail"]
    with db.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM public.jobs")).scalar_one() == 0


def test_train_is_refused_with_too_few_labeled_weeks(client, seed):
    label_weeks(seed, 3)
    response = client.post("/datasets/saml-d/train")
    assert response.status_code == 409
    assert "3 semana(s)" in response.json()["detail"]


def test_train_is_refused_without_any_laundering(client, seed):
    label_weeks(seed, 8, laundering=False)
    response = client.post("/datasets/saml-d/train")
    assert response.status_code == 409
    assert "nenhuma lavagem" in response.json()["detail"]


def test_eligibility_comes_from_the_registry_not_from_ground_truth(client, seed, db):
    # Gabarito semeado, mas o worker ainda não mediu: o registro manda, e diz "sem gabarito".
    label_weeks(seed, 8)
    with db.begin() as conn:
        conn.execute(text("UPDATE public.datasets SET labeled_weeks = 0, has_laundering = false"))
    assert client.post("/datasets/saml-d/train").status_code == 409

    # Sem nenhuma linha de gabarito, mas o registro diz que há: a API aceita.
    with db.begin() as conn:
        conn.execute(text("DELETE FROM ground_truth"))
        conn.execute(text("UPDATE public.datasets SET labeled_weeks = 8, has_laundering = true"))
    assert client.get("/datasets/saml-d/models").json()["can_train"] is True
    assert client.post("/datasets/saml-d/train").status_code == 202


def test_api_never_queries_ground_truth(client, seed, db):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root / "saml-d", 2)
    label_weeks(seed, 8)
    statements: list[str] = []

    @event.listens_for(db, "before_cursor_execute")
    def capture(_conn, _cursor, statement, *_rest):
        statements.append(statement)

    try:
        client.get("/datasets/saml-d/models")
        assert client.post("/datasets/saml-d/models/saml-d%2Fv2/promote").status_code == 200
        assert client.post("/datasets/saml-d/train").status_code == 202
    finally:
        event.remove(db, "before_cursor_execute", capture)

    assert statements
    assert not [s for s in statements if "ground_truth" in s.lower()]


def test_train_enqueues_a_job_and_blocks_a_second_one(client, seed, db):
    label_weeks(seed, 8)

    first = client.post("/datasets/saml-d/train")

    assert first.status_code == 202
    job = first.json()
    assert (job["kind"], job["dataset"], job["status"]) == ("train", "saml-d", "queued")
    assert client.get(f"/jobs/{job['id']}").json()["id"] == job["id"]
    listing = client.get("/datasets/saml-d/models").json()
    assert listing["can_train"] is False
    assert listing["training_job"]["id"] == job["id"]
    assert "em andamento" in listing["train_blocked_reason"]
    assert client.post("/datasets/saml-d/train").status_code == 409
    assert audit_actions(db) == ["train_enqueued"]


def test_promote_sets_active_version_and_writes_audit(client, seed, db):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root / "saml-d", 2)

    response = client.post("/datasets/saml-d/models/saml-d%2Fv2/promote")

    assert response.status_code == 200
    assert response.json()["active_version"] == "saml-d/v2"
    assert {v["version"]: v["active"] for v in response.json()["versions"]} == {
        "saml-d/v2": True,
        "lightgbm_v1": False,
    }
    datasets = {d["slug"]: d for d in client.get("/datasets").json()}
    assert datasets["saml-d"]["active_model_version"] == "saml-d/v2"
    with db.connect() as conn:
        row = conn.execute(
            text("SELECT actor, entity_id, details FROM audit_log WHERE action = 'model_promoted'")
        ).one()
    assert row.entity_id == "saml-d/v2"
    assert row.details["previous"] == "lightgbm_v1"
    assert row.details["dataset"] == "saml-d"

    # Voltar ao oficial limpa a versão fixada do conjunto.
    back = client.post("/datasets/saml-d/models/lightgbm_v1/promote")
    assert back.status_code == 200
    assert back.json()["active_version"] == "lightgbm_v1"
    datasets = {d["slug"]: d for d in client.get("/datasets").json()}
    assert datasets["saml-d"]["active_model_version"] is None


def test_promote_conflicts_and_not_found(client):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root / "saml-d", 2)

    assert client.post("/datasets/saml-d/models/lightgbm_v1/promote").status_code == 409
    assert client.post("/datasets/saml-d/models/lightgbm_v9/promote").status_code == 404
    assert client.post("/datasets/saml-d/models/..%2Fx/promote").status_code == 404
    assert client.post("/datasets/saml-d/models/other%2Fv2/promote").status_code == 404
    assert client.post("/datasets/saml-d/models/saml-d%2Fv2/promote").status_code == 200
    assert client.post("/datasets/saml-d/models/saml-d%2Fv2/promote").status_code == 409


# --- retreino com o retorno dos analistas e trava de promoção ----------------------------------


def test_feedback_training_is_refused_below_the_minimum(client, seed, db):
    label_weeks(seed, 8)
    feedback_labels(seed, 30, label=0)
    feedback_labels(seed, 19, label=1)

    refused = client.post("/datasets/saml-d/train", json={"use_feedback": True})
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert "pelo menos 50 rótulos" in detail and "há 49" in detail
    listing = client.get("/datasets/saml-d/models").json()["training_feedback"]
    assert listing["analyst"] == {"laundering": 19, "false_positive": 30}
    assert "há 49" in listing["blocked_reason"]

    feedback_labels(seed, 1, label=1)
    accepted = client.post("/datasets/saml-d/train", json={"use_feedback": True})
    assert accepted.status_code == 202, accepted.text
    with db.connect() as conn:
        payload = conn.execute(text("SELECT payload FROM public.jobs")).scalar_one()
        details = conn.execute(
            text("SELECT details FROM audit_log WHERE action = 'train_enqueued'")
        ).scalar_one()
    assert payload == {"use_feedback": True, "include_simulated": False}
    assert details["use_feedback"] is True


def test_feedback_training_needs_both_classes(client, seed):
    label_weeks(seed, 8)
    feedback_labels(seed, 60, label=0)
    response = client.post("/datasets/saml-d/train", json={"use_feedback": True})
    assert response.status_code == 409
    assert "nenhuma lavagem confirmada" in response.json()["detail"]
    # sem o retorno, o retreino só com o gabarito continua liberado
    assert client.post("/datasets/saml-d/train", json={}).status_code == 202


def test_simulated_labels_count_only_when_included(client, seed):
    label_weeks(seed, 8)
    feedback_labels(seed, 40, label=0, source="simulated")
    feedback_labels(seed, 20, label=1, source="simulated")

    listing = client.get("/datasets/saml-d/models").json()["training_feedback"]
    assert listing["simulated"] == {"laundering": 20, "false_positive": 40}
    assert listing["analyst"] == {"laundering": 0, "false_positive": 0}
    assert "há 0" in listing["blocked_reason"]
    assert listing["blocked_reason_with_simulated"] is None

    alone = client.post("/datasets/saml-d/train", json={"use_feedback": True})
    assert alone.status_code == 409
    both = {"use_feedback": True, "include_simulated": True}
    assert client.post("/datasets/saml-d/train", json=both).status_code == 202


def test_open_week_labels_do_not_count(client, seed):
    label_weeks(seed, 8)
    feedback_labels(seed, 40, label=0, week=OPEN_WEEK)
    feedback_labels(seed, 20, label=1, week=OPEN_WEEK)
    listing = client.get("/datasets/saml-d/models").json()["training_feedback"]
    assert listing["analyst"] == {"laundering": 0, "false_positive": 0}
    assert client.post("/datasets/saml-d/train", json={"use_feedback": True}).status_code == 409


def test_simulated_without_feedback_is_rejected(client, seed):
    label_weeks(seed, 8)
    response = client.post("/datasets/saml-d/train", json={"include_simulated": True})
    assert response.status_code == 422
    assert "só entra num retreino com o retorno" in response.text


def test_ground_truth_reason_comes_before_the_feedback_one(client, db):
    with db.begin() as conn:
        create_dataset(conn, name="Sem gabarito", slug="sem-gabarito")
    listing = client.get("/datasets/sem-gabarito/models").json()["training_feedback"]
    assert "não tem gabarito" in listing["blocked_reason"]
    assert "não tem gabarito" in listing["blocked_reason_with_simulated"]


def test_listing_shows_the_comparison_the_gate_and_the_feedback_used(client, seed):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root / "saml-d", 2, comparison=comparison(False), feedback=FEEDBACK_BLOCK)
    write_card(root / "saml-d", 3, comparison=comparison(True, new=0.95))

    versions = {v["version"]: v for v in client.get("/datasets/saml-d/models").json()["versions"]}

    blocked = versions["saml-d/v2"]
    assert blocked["comparison"]["gate"]["passed"] is False
    assert blocked["comparison"]["active_version"] == "lightgbm_v1"
    period = blocked["comparison"]["period"]
    assert period == {"start": "2023-07-17", "end": "2023-08-21", "weeks": 6}
    assert blocked["comparison"]["active"]["queue_recall"] == 0.95
    assert blocked["comparison"]["recall_difference"] == pytest.approx(-0.05)
    assert blocked["feedback"] == {
        "used": True,
        "include_simulated": True,
        "labels": {
            "total": 300,
            "laundering": 120,
            "false_positive": 180,
            "analyst": 20,
            "simulated": 280,
            "model": 290,
            "exploration": 10,
        },
        "labels_in_validation": 250,
        "labels_reserved_for_test": 0,
        "transactions_covered": 2000,
        "transactions_weighted": 1900,
        "transactions_without_truth": 0,
        "conflicts": 100,
        "split": "feedback",
    }
    assert versions["saml-d/v3"]["comparison"]["gate"]["passed"] is True
    assert versions["saml-d/v3"]["feedback"] is None  # ficha sem o bloco
    assert versions["lightgbm_v1"]["comparison"] is None  # o oficial não tem comparação


def test_promotion_is_refused_when_the_gate_failed(client, seed, db):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root / "saml-d", 2, comparison=comparison(False))
    write_card(root / "saml-d", 3, comparison=comparison(True, new=0.95))
    write_card(root / "saml-d", 4, comparison={"gate": "estragada"})  # ficha estragada

    refused = client.post("/datasets/saml-d/models/saml-d%2Fv2/promote")
    assert refused.status_code == 409
    assert refused.json()["detail"].startswith("Bloqueada: acha 5,0 p.p. menos lavadoras")
    assert audit_actions(db) == []
    assert client.get("/datasets/saml-d/models").json()["active_version"] == "lightgbm_v1"

    assert client.post("/datasets/saml-d/models/saml-d%2Fv3/promote").status_code == 200
    # ficha sem comparação legível promove como antes; voltar ao oficial também
    assert client.post("/datasets/saml-d/models/saml-d%2Fv4/promote").status_code == 200
    assert client.post("/datasets/saml-d/models/lightgbm_v1/promote").status_code == 200
    assert audit_actions(db) == ["model_promoted"] * 3


def test_api_never_queries_ground_truth_with_feedback(client, seed, db):
    root = Path(get_settings().model_dir)
    write_card(root, 1)
    write_card(root / "saml-d", 2, comparison=comparison(True, new=0.95), feedback=FEEDBACK_BLOCK)
    label_weeks(seed, 8)
    feedback_labels(seed, 40, label=0)
    feedback_labels(seed, 20, label=1)
    statements: list[str] = []

    @event.listens_for(db, "before_cursor_execute")
    def capture(_conn, _cursor, statement, *_rest):
        statements.append(statement)

    try:
        client.get("/datasets/saml-d/models")
        assert client.post("/datasets/saml-d/train", json={"use_feedback": True}).status_code == 202
        assert client.post("/datasets/saml-d/models/saml-d%2Fv2/promote").status_code == 200
    finally:
        event.remove(db, "before_cursor_execute", capture)

    assert statements
    assert not [s for s in statements if "ground_truth" in s.lower()]
