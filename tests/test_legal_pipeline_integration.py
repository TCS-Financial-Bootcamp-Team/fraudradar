"""Offline integration tests for the legal RAG pipeline."""

from dataclasses import replace

import pytest

from fraudradar.ai.documents import RetrievedDocument
from fraudradar.ai.legal_chat_adapter import (
    legal_payload_to_chat_response,
)
from fraudradar.ai.legal_generation import LegalAnswer
from fraudradar.ai.legal_pipeline import (
    generate_from_prepared_evidence,
)
from fraudradar.ai.legal_presentation import present_legal_rag
from fraudradar.ai.legal_retrieval import PreparedLegalEvidence


@pytest.fixture
def prepared_evidence():
    metadata = {
        "source_id": "synthetic-test",
        "official_url": "https://example.org/legal-test",
        "snapshot_sha256": "a" * 64,
        "review_status": "reviewed",
    }

    documents = (
        RetrievedDocument(
            id=1,
            source="synthetic-test:article-a",
            chunk_index=0,
            content="Art. A. Synthetic customer identification rule.",
            metadata={**metadata, "article": "Art. A"},
            similarity=0.95,
        ),
        RetrievedDocument(
            id=2,
            source="synthetic-test:article-b",
            chunk_index=0,
            content="Art. B. Synthetic administrative sanctions rule.",
            metadata={**metadata, "article": "Art. B"},
            similarity=0.90,
        ),
    )

    return PreparedLegalEvidence(
        documents=documents,
        context=(
            "Synthetic legal test context.\n"
            "[F1] Article A.\n"
            "[F2] Article B."
        ),
        citation_ids=("F1", "F2"),
    )


def valid_generator(**kwargs):
    return LegalAnswer(
        text="Customer identification [F1] and sanctions [F2].",
        citations=("F1", "F2"),
        model="mock-offline",
        evidence_count=2,
    )


def test_generated_answer_has_valid_citations(prepared_evidence):
    result = generate_from_prepared_evidence(
        question="What are the legal requirements?",
        prepared=prepared_evidence,
        generator=valid_generator,
    )

    assert result.status == "generated"
    assert result.answer is not None
    assert result.answer.citations == ("F1", "F2")
    assert result.answer.evidence_count == 2


def test_frontend_receives_cited_sources(prepared_evidence):
    result = generate_from_prepared_evidence(
        question="What are the legal requirements?",
        prepared=prepared_evidence,
        generator=valid_generator,
    )

    payload = present_legal_rag(result)
    response = legal_payload_to_chat_response(payload)

    assert payload["requires_legal_review"] is False
    assert len(response.sources) == 2
    assert "[F1]" in response.answer
    assert "[F2]" in response.answer

    for index, source in enumerate(response.sources, start=1):
        assert f"[F{index}]" in source.title
        assert "https://example.org/" in source.excerpt


def test_provider_503_preserves_evidence(prepared_evidence):
    class ProviderUnavailableErrorError(Exception):
        status_code = 503

    def failing_generator(**kwargs):
        raise ProviderUnavailableErrorError("Synthetic provider failure")

    result = generate_from_prepared_evidence(
        question="What are the legal requirements?",
        prepared=prepared_evidence,
        generator=failing_generator,
    )

    assert result.status == "llm_unavailable"
    assert result.answer is None
    assert len(result.documents) == 2

    payload = present_legal_rag(result)
    response = legal_payload_to_chat_response(payload)

    assert len(response.sources) == 2
    assert "indisponivel" in response.answer.lower()


def test_unknown_citation_is_rejected(prepared_evidence):
    def invalid_generator(**kwargs):
        return LegalAnswer(
            text="Unsupported statement [F99].",
            citations=("F99",),
            model="mock-offline",
            evidence_count=2,
        )

    with pytest.raises(ValueError, match="citacoes desconhecidas"):
        generate_from_prepared_evidence(
            question="What are the legal requirements?",
            prepared=prepared_evidence,
            generator=invalid_generator,
        )


def test_pending_documents_are_blocked(prepared_evidence):
    pending_document = replace(
        prepared_evidence.documents[0],
        metadata={
            **prepared_evidence.documents[0].metadata,
            "review_status": "pending_review",
        },
    )

    pending = replace(
        prepared_evidence,
        documents=(
            pending_document,
            prepared_evidence.documents[1],
        ),
    )

    calls = []

    def forbidden_generator(**kwargs):
        calls.append(kwargs)
        raise AssertionError("Generator must not be called")

    with pytest.raises(ValueError, match="nao revisados"):
        generate_from_prepared_evidence(
            question="What are the legal requirements?",
            prepared=pending,
            generator=forbidden_generator,
        )

    assert calls == []

    reviewed_result = generate_from_prepared_evidence(
        question="What are the legal requirements?",
        prepared=prepared_evidence,
        generator=valid_generator,
    )

    pending_result = replace(
        reviewed_result,
        documents=pending.documents,
    )

    payload = present_legal_rag(pending_result)

    assert payload["requires_legal_review"] is True

    with pytest.raises(ValueError, match="revisao juridica"):
        legal_payload_to_chat_response(payload)
