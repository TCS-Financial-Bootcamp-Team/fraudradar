"""`python -m worker`: código de saída 0 quando dá certo ou não há nada a fazer, 1 em erro, com
a mensagem do que rodar."""

import logging
from datetime import datetime

import pytest
from sqlalchemy import text

pytest.importorskip("lightgbm")

from worker_helpers import rows, scalar  # noqa: E402

from fraudradar.config import get_settings  # noqa: E402
from fraudradar.datasets import create_dataset, use_dataset  # noqa: E402
from fraudradar.features.history import week_start  # noqa: E402
from worker.cli import main  # noqa: E402


@pytest.fixture
def messages(caplog):
    caplog.set_level(logging.INFO, logger="worker")

    def text() -> str:
        return "\n".join(r.getMessage() for r in caplog.records)

    return text


@pytest.fixture
def with_model(model_dir, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(model_dir))
    get_settings.cache_clear()


def test_week_that_is_not_a_monday(messages):
    assert main(["batch", "--week", "2023-05-23"]) == 1
    assert "não é segunda-feira: a semana é a da segunda 2023-05-22" in messages()


def test_week_in_the_wrong_format(messages):
    assert main(["backfill", "--from", "22/05/2023"]) == 1
    assert "use a data no formato AAAA-MM-DD" in messages()


def test_database_down(messages):
    """Sem o fixture `db`, DATABASE_URL aponta para uma porta fechada."""
    assert main(["replay"]) == 1
    assert "banco indisponível" in messages() and "docker compose up -d db" in messages()


def test_missing_csv(messages, tmp_path):
    assert main(["load", "--csv", str(tmp_path / "nada.csv")]) == 1
    assert "arquivo não encontrado" in messages()


def test_no_model(db, messages):
    """MODEL_DIR aponta para uma pasta vazia (tests/conftest.py)."""
    assert main(["replay"]) == 1
    assert "nenhum modelo" in messages() and "fraudradar.model train" in messages()


def test_load_then_load_again(db, saml_d_csv, messages):
    assert main(["load", "--csv", str(saml_d_csv)]) == 0
    assert "carga pronta: 4.000 transações" in messages()
    assert main(["load", "--csv", str(saml_d_csv)]) == 0
    assert "já está no banco" in messages()
    assert scalar(db, "SELECT count(*) FROM transactions") == 4000


def test_batch_then_nothing_to_do(loaded, with_model, messages):
    assert main(["batch", "--week", "2023-05-22"]) == 0
    assert "semana 2023-05-22:" in messages() and "pronto: 1 semana(s)" in messages()
    assert main(["batch", "--week", "2023-05-22"]) == 0
    assert "já processada, nada a fazer" in messages()
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches") == 1


def test_in_sample_week_is_an_error(loaded, with_model, messages):
    assert main(["batch", "--week", "2023-05-15"]) == 1
    assert "--allow-in-sample" in messages()
    assert main(["batch", "--week", "2023-05-15", "--allow-in-sample"]) == 0


def test_replay_with_nothing_to_process(db, with_model, messages):
    assert main(["replay"]) == 0
    assert "nada a processar" in messages()


def _forget_labels(engine) -> None:
    """O registro como num banco que já existia antes do resumo do gabarito."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE public.datasets"
                " SET labeled_weeks = 0, has_laundering = false, labels_checked_at = NULL"
            )
        )


def _registry(engine) -> dict[str, tuple]:
    return {
        r["slug"]: (r["labeled_weeks"], r["has_laundering"], r["labels_checked_at"] is not None)
        for r in rows(engine, "SELECT * FROM public.datasets")
    }


def test_labels_measures_every_registered_dataset(loaded, saml_d, messages):
    with loaded.begin() as conn:
        labeled = create_dataset(conn, name="Rotulada", slug="rotulada")
        use_dataset(conn, labeled)
        for moment, label in ((datetime(2023, 1, 2, 9), 0), (datetime(2023, 1, 10, 9), 1)):
            conn.execute(
                text(
                    "WITH tx AS (INSERT INTO transactions (occurred_at, sender, receiver, amount,"
                    " payment_currency, received_currency, sender_country, receiver_country,"
                    " payment_type) VALUES (:at, 1, 2, 10, 'UK pounds', 'UK pounds', 'UK', 'UK',"
                    " 'ACH') RETURNING id)"
                    " INSERT INTO ground_truth (transaction_id, label, original_typology, typology)"
                    " SELECT id, :label, 'Fan_Out', 'fan_out' FROM tx"
                ),
                {"at": moment, "label": label},
            )
    _forget_labels(loaded)

    assert main(["labels"]) == 0

    saml_d_weeks = week_start(saml_d[0]["occurred_at"]).nunique()
    assert _registry(loaded) == {
        "saml-d": (saml_d_weeks, True, True),
        "rotulada": (2, True, True),
    }
    assert f"saml-d: {saml_d_weeks} semana(s) com gabarito, com lavagem" in messages()
    assert "rotulada: 2 semana(s) com gabarito, com lavagem" in messages()


def test_labels_for_one_dataset_or_an_unknown_one(loaded, messages):
    with loaded.begin() as conn:
        create_dataset(conn, name="Sem gabarito", slug="sem-gabarito")
    _forget_labels(loaded)

    assert main(["labels", "--dataset", "sem-gabarito"]) == 0
    registry = _registry(loaded)
    assert registry["sem-gabarito"] == (0, False, True)
    assert registry["saml-d"] == (0, False, False)  # os outros conjuntos ficam como estavam
    assert "sem-gabarito: 0 semana(s) com gabarito, sem lavagem marcada" in messages()

    assert main(["labels", "--dataset", "nao-existe"]) == 1
    assert "conjunto de dados 'nao-existe' não encontrado" in messages()
