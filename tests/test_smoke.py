import importlib

import pytest
from fastapi.testclient import TestClient

from fraudradar.config import get_settings
from fraudradar.data import schema


@pytest.mark.parametrize(
    "module",
    [
        "fraudradar",
        "fraudradar.data",
        "fraudradar.features",
        "fraudradar.model",
        "fraudradar.ai",
        "api.main",
        "worker.cli",
    ],
)
def test_imports_module(module):
    importlib.import_module(module)


def test_loads_config():
    s = get_settings()
    assert s.database_url.startswith("postgresql+psycopg://")
    assert s.embedding_dim == 384
    assert s.llm_key_configured is False


def test_schema_separates_labels_from_features():
    assert len(schema.CSV_COLUMNS) == 12
    assert set(schema.CSV_DTYPES) == set(schema.CSV_COLUMNS)
    assert "Is_laundering" not in schema.TRANSACTION_COLUMNS
    assert "Laundering_type" not in schema.TRANSACTION_COLUMNS


def test_health_when_database_is_down():
    from api.main import create_app

    resp = TestClient(create_app()).get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["database"]["ok"] is False
    assert body["model"]["ok"] is False
    assert body["llm"]["ok"] is False


def test_health_detects_model_and_key(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    get_settings.cache_clear()
    (tmp_path / get_settings().model_file).write_text("model")

    from api.main import create_app

    body = TestClient(create_app()).get("/health").json()
    assert body["model"]["ok"] is True
    assert body["llm"]["ok"] is True


@pytest.mark.parametrize("variable", ["GEMINI_API_KEY", "GOOGLE_API_KEY"])
def test_gemini_key_is_read_from_either_name(monkeypatch, variable):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv(variable, "  chave-de-teste  ")
    get_settings.cache_clear()
    s = get_settings()
    assert s.llm_key_configured is True
    assert s.llm_api_key == "chave-de-teste"


def test_empty_gemini_key_does_not_hide_google_key(monkeypatch):
    # É o .env.example preenchido só com GOOGLE_API_KEY.
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GOOGLE_API_KEY", "chave-google")
    get_settings.cache_clear()
    assert get_settings().llm_api_key == "chave-google"


def test_key_of_another_provider_does_not_count(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    get_settings.cache_clear()
    assert get_settings().llm_key_configured is False


def test_worker_fails_cleanly_without_database():
    from worker.cli import main

    assert main(["replay"]) == 1
