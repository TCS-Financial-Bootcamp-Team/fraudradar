"""Trabalho ``train``: retreino de um conjunto a partir do banco, e a promoção da versão nova."""

import json
import shutil
from pathlib import Path

import lightgbm as lgb
import pandas as pd
from sqlalchemy import text
from worker_helpers import rows

from fraudradar.config import get_settings
from fraudradar.datasets import resolve_dataset
from fraudradar.model.training import OFFICIAL_SPLIT, resolve_split
from worker.batch import _dataset_model, model_version
from worker.jobs import process_next_job


def run_train(client, db) -> dict:
    response = client.post("/datasets/saml-d/train")
    assert response.status_code == 202, response.text
    assert process_next_job(db) is True
    return rows(db, "SELECT * FROM public.jobs WHERE id = :id", id=int(response.json()["id"]))[0]


def test_train_writes_a_new_version_with_metrics_and_keeps_official_active(
    client, loaded, model_dir
):
    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():  # o modelo oficial do SAML-D (v1) já existe
        shutil.copy(path, official / path.name)

    job = run_train(client, loaded)

    assert job["status"] == "done", job["message"]
    assert job["progress"] == 100
    # Numera depois do oficial: o nome da versão é chave em model_versions.
    own = official / "saml-d"
    card = json.loads((own / "lightgbm_v2.json").read_text(encoding="utf-8"))
    official_card = json.loads((official / "lightgbm_v1.json").read_text(encoding="utf-8"))
    assert (own / "lightgbm_v2.txt").is_file()
    assert set(card["metrics"]) == set(official_card["metrics"])
    assert card["features"] == official_card["features"]
    assert card["train_end"] == OFFICIAL_SPLIT.train_end  # divisão no tempo oficial
    assert card["validation_start"] == OFFICIAL_SPLIT.validation_start
    assert card["file"] == "lightgbm_v2.txt"
    assert not (own / "lightgbm_model.txt").exists()  # só o oficial alimenta o health
    # A versão nova não vira a ativa sozinha.
    listing = client.get("/datasets/saml-d/models").json()
    assert listing["active_version"] == "lightgbm_v1"
    assert {v["version"]: v["active"] for v in listing["versions"]} == {
        "saml-d/v2": False,
        "lightgbm_v1": True,
    }
    new = listing["versions"][0]
    assert new["metrics"]["pr_auc"] is not None
    assert "model_trained" in [r["action"] for r in rows(loaded, "SELECT action FROM audit_log")]


def test_scoring_loads_the_promoted_version(client, loaded, model_dir):
    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():
        shutil.copy(path, official / path.name)
    assert run_train(client, loaded)["status"] == "done"
    with loaded.connect() as conn:
        _, before = _dataset_model(resolve_dataset(conn, "saml-d"), official)
    assert before["version"] == 1  # sem versão fixada: o oficial

    response = client.post("/datasets/saml-d/models/saml-d%2Fv2/promote")
    assert response.status_code == 200

    with loaded.connect() as conn:
        dataset = resolve_dataset(conn, "saml-d")
    booster, after = _dataset_model(dataset, official)
    assert dataset.active_model_version == "saml-d/v2"
    assert after["version"] == 2
    expected = lgb.Booster(model_file=str(official / "saml-d" / "lightgbm_v2.txt"))
    sample = pd.DataFrame([[0.0] * len(after["features"])], columns=after["features"])
    for column, categories in after["categories"].items():
        sample[column] = pd.Categorical([categories[0]], categories=categories)
    assert booster.predict(sample).tolist() == expected.predict(sample).tolist()
    # O retreino do conjunto grava o nome com o prefixo: não colide com o oficial (lightgbm_v2).
    assert after["model_name"] == "saml-d/v2"
    assert model_version(after) == "saml-d/v2"
    assert model_version(before) == "lightgbm_v1"


def test_load_and_train_fill_the_label_summary_in_the_registry(client, loaded, model_dir):
    registry = rows(loaded, "SELECT * FROM public.datasets WHERE slug = 'saml-d'")[0]
    assert registry["labeled_weeks"] >= 4  # a carga mediu o gabarito
    assert registry["has_laundering"] is True
    assert registry["labels_checked_at"] is not None

    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():
        shutil.copy(path, official / path.name)
    with loaded.begin() as conn:  # registro velho: o treino mede de novo
        conn.execute(
            text("UPDATE public.datasets SET labeled_weeks = 99, labels_checked_at = NULL")
        )
    assert run_train(client, loaded)["status"] == "done"

    after = rows(loaded, "SELECT * FROM public.datasets WHERE slug = 'saml-d'")[0]
    assert after["labeled_weeks"] == registry["labeled_weeks"]
    assert after["labels_checked_at"] is not None


def test_job_fails_in_portuguese_when_labels_disappear(client, loaded, seed):
    response = client.post("/datasets/saml-d/train")
    assert response.status_code == 202
    with loaded.begin() as conn:
        conn.execute(text("DELETE FROM ground_truth"))

    process_next_job(loaded)

    job = rows(loaded, "SELECT status, message FROM public.jobs")[0]
    assert job["status"] == "failed"
    assert "não tem gabarito" in job["message"]
    registry = rows(loaded, "SELECT labeled_weeks, has_laundering FROM public.datasets")[0]
    assert (registry["labeled_weeks"], registry["has_laundering"]) == (0, False)


def test_resolve_split_keeps_official_dates_and_scales_for_other_periods():
    official = pd.DataFrame({"occurred_at": pd.to_datetime(["2022-10-07", "2023-08-23"])})
    assert resolve_split(official) == OFFICIAL_SPLIT

    other = pd.DataFrame({"occurred_at": pd.to_datetime(["2025-01-01", "2025-03-09"])})
    split = resolve_split(other)
    train_end = pd.Timestamp(split.train_end)
    validation = pd.Timestamp(split.validation_start)
    assert train_end.weekday() == 6  # domingo
    assert validation.weekday() == 0  # segunda
    assert validation < train_end < pd.Timestamp("2025-03-09")  # sobra pelo menos uma semana
