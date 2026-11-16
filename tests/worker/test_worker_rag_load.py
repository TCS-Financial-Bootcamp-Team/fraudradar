"""`python -m worker rag-load`: os snapshots de rag/snapshots/ em rag_documents.

Os embeddings são falsos (um vetor fixo por texto, no lugar do SentenceTransformer): os testes
conferem a carga e a busca do chat, não o modelo. Precisam do Postgres de teste (`db`).
"""

import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import pytest
from sqlalchemy import text

from fraudradar.ai import embeddings
from fraudradar.ai.chunking import split_document
from fraudradar.ai.legal_generation import LegalAnswer, _parse_context
from fraudradar.ai.legal_ingestion import prepare_legal_snapshot
from fraudradar.config import get_settings
from worker.cli import main

# ~950 caracteres: 2 trechos com o corte do snapshot (900/120) e 1 com o padrão de
# ingest_document (1000/150). Se a carga esquecer o corte do snapshot, a contagem não fecha.
LONG_ARTICLE = "Art. 2. " + " ".join(["obrigacao de comunicar operacoes suspeitas ao COAF"] * 18)


class FakeModel:
    """Fica no lugar do SentenceTransformer: um vetor unitário fixo para cada texto."""

    def __init__(self) -> None:
        self.encoded: list[str] = []

    def encode(self, texts, **kwargs) -> np.ndarray:
        self.encoded.extend(texts)
        return np.stack([_unit_vector(value) for value in texts])


def _unit_vector(value: str) -> np.ndarray:
    seed = int.from_bytes(hashlib.sha256(value.encode("utf-8")).digest()[:8], "big")
    vector = np.random.default_rng(seed).standard_normal(384)
    return (vector / np.linalg.norm(vector)).astype(np.float32)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def snapshot(source_id: str = "lei-teste", review_status: str = "reviewed") -> dict:
    """Um snapshot pequeno, no formato de rag/snapshots/, com os hashes certos."""
    contents = [
        "Art. 1. Esta lei de teste trata de penalidades administrativas e de multa.",
        LONG_ARTICLE,
    ]
    return {
        "schema_version": 1,
        "source_id": source_id,
        "title": "Lei de teste",
        "authority": "Teste",
        "official_url": "https://example.org/lei-teste",
        "retrieved_at_utc": "2026-11-16T00:00:00+00:00",
        "document_type": "law",
        "publication_date": "2026-01-01",
        "version_policy": "test",
        "review_status": review_status,
        "text_sha256": _sha256("\n\n".join(contents)),
        "article_count": len(contents),
        "articles": [
            {"reference": f"Art. {number}", "content": content, "content_sha256": _sha256(content)}
            for number, content in enumerate(contents, start=1)
        ],
    }


def write(folder: Path, name: str, data: dict) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return folder


@pytest.fixture
def model(monkeypatch) -> FakeModel:
    fake = FakeModel()
    monkeypatch.setattr(embeddings, "_load_model", lambda name: fake)
    return fake


@pytest.fixture
def messages(caplog):
    caplog.set_level(logging.INFO, logger="worker")
    return lambda: "\n".join(record.getMessage() for record in caplog.records)


def stored(db) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute(
            text("SELECT id, source, chunk_index, metadata FROM rag_documents ORDER BY id")
        )
        return [dict(row) for row in rows.mappings()]


def test_the_long_article_depends_on_the_snapshot_chunking():
    """Pré-condição do controle: os dois cortes dão contagens diferentes para o artigo longo."""
    assert len(split_document(LONG_ARTICLE, max_chars=900, overlap_chars=120)) == 2
    assert len(split_document(LONG_ARTICLE, max_chars=1000, overlap_chars=150)) == 1


def test_loads_every_chunk_with_what_the_chat_filters_on(db, model, tmp_path, messages):
    data = snapshot()
    folder = write(tmp_path / "snapshots", "lei-teste.json", data)

    assert main(["rag-load", "--snapshots", str(folder)]) == 0

    rows = stored(db)
    expected = sum(article.expected_chunks for article in prepare_legal_snapshot(data))
    assert len(rows) == expected == 3
    for row in rows:
        metadata = row["metadata"]
        # As três chaves que a busca do chat usa no WHERE (legal_hybrid.py).
        assert metadata["source_id"] == "lei-teste"
        assert metadata["snapshot_sha256"] == data["text_sha256"]
        assert metadata["review_status"] == "reviewed"
        assert metadata["embedding_model"] == get_settings().embedding_model
    assert len([row for row in rows if row["metadata"]["article"] == "Art. 2"]) == 2
    assert "2 artigos em 3 trechos carregados" in messages()


def test_second_run_changes_nothing(db, model, tmp_path, messages):
    folder = write(tmp_path / "snapshots", "lei-teste.json", snapshot())
    assert main(["rag-load", "--snapshots", str(folder)]) == 0
    before = stored(db)
    model.encoded.clear()

    assert main(["rag-load", "--snapshots", str(folder)]) == 0

    assert stored(db) == before
    assert model.encoded == []
    assert "já está na base" in messages()


def test_approving_the_snapshot_loads_it_again(db, model, tmp_path, messages):
    folder = write(
        tmp_path / "snapshots", "lei-teste.json", snapshot(review_status="pending_review")
    )
    assert main(["rag-load", "--snapshots", str(folder)]) == 0
    assert {row["metadata"]["review_status"] for row in stored(db)} == {"pending_review"}
    assert "o chat só usa a fonte depois de revisada" in messages()

    write(folder, "lei-teste.json", snapshot(review_status="reviewed"))
    assert main(["rag-load", "--snapshots", str(folder)]) == 0

    rows = stored(db)
    assert len(rows) == 3
    assert {row["metadata"]["review_status"] for row in rows} == {"reviewed"}
    assert "3 trechos antigos substituídos" in messages()


def test_a_bad_snapshot_writes_nothing(db, model, tmp_path, messages):
    """Tudo ou nada: o primeiro arquivo, válido, também não fica na base."""
    tampered = snapshot(source_id="lei-adulterada")
    tampered["articles"][0]["content"] += " Trecho acrescentado depois do hash."
    folder = write(tmp_path / "snapshots", "a-valida.json", snapshot())
    write(folder, "b-adulterada.json", tampered)

    assert main(["rag-load", "--snapshots", str(folder)]) == 1

    assert stored(db) == []
    assert "b-adulterada.json" in messages() and "nada foi gravado" in messages()


def test_folder_without_snapshots(tmp_path, messages):
    assert main(["rag-load", "--snapshots", str(tmp_path / "nada")]) == 1
    assert "pasta de snapshots não encontrada" in messages()
    assert main(["rag-load", "--snapshots", str(tmp_path)]) == 1
    assert "nenhum snapshot" in messages()


def test_the_chat_answers_after_loading_the_real_snapshot(client, model, monkeypatch):
    """Aceitação: com a base vazia o chat responde 503; depois do rag-load, 200 com as fontes.

    Usa o snapshot de verdade (rag/snapshots/) e troca só o Gemini por uma resposta fixa.
    """

    def fake_gemini(*, question, context, allow_pending_review=False):
        evidence = _parse_context(context, allow_pending_review=allow_pending_review)
        return LegalAnswer(
            text="Resposta de teste [F1].",
            citations=("F1",),
            model="gemini-teste",
            evidence_count=len(evidence),
        )

    monkeypatch.setattr(
        "fraudradar.ai.legal_pipeline.generate_legal_answer_from_settings", fake_gemini
    )
    for name, value in {
        "LLM_PROVIDER": "gemini",
        "LLM_MODEL": "gemini-teste",
        "GEMINI_API_KEY": "chave",
    }.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    request = {
        "message": "Quais sao as penalidades administrativas?",
        "context": {"page": "/dashboard", "week": "2023-01-02"},
        "history": [],
    }

    empty = client.post("/chat", json=request)
    assert empty.status_code == 503
    assert empty.json()["code"] == "ai.no_legal_sources"

    assert main(["rag-load"]) == 0

    response = client.post("/chat", json=request)
    assert response.status_code == 200
    payload = response.json()
    assert payload["answer"] == "Resposta de teste [F1]."
    assert payload["sources"]
    for number, source in enumerate(payload["sources"], start=1):
        assert source["title"].startswith(f"[F{number}] Art. ")
        assert "https://www2.camara.leg.br/" in source["excerpt"]
