"""Versões do modelo por conjunto: listagem, pedido de retreino e promoção."""

import json
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import event, text

from fraudradar.config import get_settings
from fraudradar.datasets import create_dataset
from worker.labels import refresh_label_stats


def write_card(folder: Path, version: int, *, pr_auc: float = 0.5) -> str:
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
    }
    (folder / f"{name}.json").write_text(json.dumps(card), encoding="utf-8")
    return name


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
