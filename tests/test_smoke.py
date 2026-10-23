import importlib

import pytest
from fastapi.testclient import TestClient

from fraudradar.config import get_settings
from fraudradar.dados import schema


@pytest.mark.parametrize(
    "modulo",
    [
        "fraudradar",
        "fraudradar.dados",
        "fraudradar.features",
        "fraudradar.modelo",
        "fraudradar.ia",
        "api.main",
        "worker.cli",
    ],
)
def test_importa(modulo):
    importlib.import_module(modulo)


def test_config_carrega():
    s = get_settings()
    assert s.database_url.startswith("postgresql+psycopg://")
    assert s.embedding_dim == 384
    assert s.chave_llm_configurada is False


def test_schema_separa_rotulo_das_features():
    assert len(schema.COLUNAS_CSV) == 12
    assert set(schema.DTYPES_CSV) == set(schema.COLUNAS_CSV)
    assert "Is_laundering" not in schema.COLUNAS_TRANSACAO
    assert "Laundering_type" not in schema.COLUNAS_TRANSACAO


def test_saude_com_banco_fora():
    from api.main import criar_app

    resp = TestClient(criar_app()).get("/saude")
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["status"] == "degradado"
    assert corpo["banco"]["ok"] is False
    assert corpo["modelo"]["ok"] is False
    assert corpo["llm"]["ok"] is False


def test_saude_detecta_modelo_e_chave(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-teste")
    get_settings.cache_clear()
    (tmp_path / get_settings().model_file).write_text("modelo")

    from api.main import criar_app

    corpo = TestClient(criar_app()).get("/saude").json()
    assert corpo["modelo"]["ok"] is True
    assert corpo["llm"]["ok"] is True


def test_worker_falha_limpo_sem_banco():
    from worker.cli import main

    assert main(["replay"]) == 1
