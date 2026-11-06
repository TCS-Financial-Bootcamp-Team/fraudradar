"""`python -m worker`: código de saída 0 quando dá certo ou não há nada a fazer, 1 em erro, com
a mensagem do que rodar."""

import logging

import pytest

pytest.importorskip("lightgbm")

from worker_helpers import scalar  # noqa: E402

from fraudradar.config import get_settings  # noqa: E402
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
