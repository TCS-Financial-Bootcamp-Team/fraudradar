"""Orquestra o chat jurídico sem manter a conexão durante a geração."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy import Engine

from api.schemas.chat import ChatResponse
from fraudradar.ai.legal_chat_adapter import legal_payload_to_chat_response
from fraudradar.ai.legal_generation import LegalAnswer, gemini_settings
from fraudradar.ai.legal_pipeline import generate_from_prepared_evidence
from fraudradar.ai.legal_presentation import present_legal_rag
from fraudradar.ai.legal_retrieval import (
    PreparedLegalEvidence,
    prepare_legal_evidence,
)
from fraudradar.db import get_engine


class LegalEvidenceUnavailableError(Exception):
    """Indica que não há evidência jurídica aprovada para a pergunta."""


def _active_legal_source() -> tuple[str, str]:
    """Identifica o snapshot jurídico versionado usado nesta implantação."""
    root = Path(__file__).resolve().parents[1]
    snapshots = sorted((root / "rag" / "snapshots").glob("lei-9613-1998-*.json"))

    if len(snapshots) != 1:
        raise LegalEvidenceUnavailableError("Fonte juridica versionada nao configurada.")

    snapshot = json.loads(snapshots[0].read_text(encoding="utf-8-sig"))

    source_id = snapshot.get("source_id")
    snapshot_sha256 = snapshot.get("text_sha256")

    if (
        not isinstance(source_id, str)
        or source_id != "lei-9613-1998"
        or not isinstance(snapshot_sha256, str)
        or len(snapshot_sha256) != 64
    ):
        raise LegalEvidenceUnavailableError("Metadados da fonte juridica invalidos.")

    return source_id, snapshot_sha256


def answer_legal_chat(
    question: str,
    *,
    retrieval_query: str | None = None,
    engine: Engine | None = None,
    generator: Callable[..., LegalAnswer] | None = None,
    retriever: Callable[..., PreparedLegalEvidence] | None = None,
) -> ChatResponse:
    """Prepara evidências revisadas, fecha o banco e gera a resposta.

    Este serviço nunca habilita evidências pendentes de revisão. Dublês de teste
    precisam ser injetados explicitamente pela chamada.
    """
    if not isinstance(question, str) or not question.strip():
        raise ValueError("Pergunta juridica vazia.")

    if len(question) > 2000:
        raise ValueError("Pergunta juridica excede 2000 caracteres.")

    search_question = question if retrieval_query is None else retrieval_query
    if not isinstance(search_question, str) or not search_question.strip():
        raise ValueError("Consulta de recuperação jurídica vazia.")

    # Falha antes da recuperação, que carrega o modelo de embedding e consulta o banco.
    if generator is None:
        gemini_settings()

    source_id, snapshot_sha256 = _active_legal_source()

    if engine is None:
        engine = get_engine()

    if retriever is None:
        retriever = prepare_legal_evidence

    # O Gemini nunca é chamado dentro deste contexto de conexão.
    with engine.connect() as conn:
        try:
            prepared = retriever(
                conn,
                question=search_question,
                source_id=source_id,
                snapshot_sha256=snapshot_sha256,
                include_pending_review=False,
                max_documents=3,
                max_total_chars=5000,
            )
        except ValueError as error:
            if "Nenhuma evidencia juridica autorizada" not in str(error):
                raise

            raise LegalEvidenceUnavailableError(
                "Nenhuma fonte juridica aprovada foi encontrada."
            ) from error

    # A conexão já foi fechada quando a fase do LLM começa.
    result = generate_from_prepared_evidence(
        question=question,
        prepared=prepared,
        generator=generator,
        allow_pending_review=False,
    )

    payload: dict[str, Any] = present_legal_rag(result)
    return legal_payload_to_chat_response(payload)
