"""Encaminha a resposta do chat ao contrato HTTP, sem acesso implícito ao banco."""

from collections.abc import Callable

from api.legal_chat_service import answer_legal_chat
from api.schemas.chat import ChatResponse
from fraudradar.ai.chat_router import ChatRoute
from fraudradar.ai.decision_chat import (
    generate_decision_answer_from_settings,
    validate_decision_answer,
)
from fraudradar.ai.domain_chat import (
    OUT_OF_SCOPE_REPLY,
    generate_domain_answer_from_settings,
    validate_domain_answer,
)
from fraudradar.ai.legal_chat_intent import small_talk_reply


def answer_chat_message(
    question: str,
    *,
    route: ChatRoute,
    retrieval_query: str | None = None,
    legal_answerer: Callable[..., ChatResponse] | None = None,
    domain_generator: Callable[..., str] | None = None,
    decision_generator: Callable[..., str] | None = None,
) -> ChatResponse:
    """Gera somente no caminho escolhido; apenas o jurídico pode recuperar fontes."""
    if route == "legal":
        answerer = legal_answerer or answer_legal_chat
        if retrieval_query is None:
            return answerer(question)
        return answerer(question, retrieval_query=retrieval_query)
    if route == "small_talk":
        answer = small_talk_reply(question) or small_talk_reply("ajuda")
    elif route == "out_of_scope":
        answer = OUT_OF_SCOPE_REPLY
    elif route == "domain":
        generate = domain_generator or generate_domain_answer_from_settings
        answer = validate_domain_answer(generate(question=question))
    elif route == "decision":
        generate = decision_generator or generate_decision_answer_from_settings
        answer = validate_decision_answer(generate(question=question))
    else:
        raise ValueError("Rota de chat inválida.")
    return ChatResponse(kind=route, answer=answer, sources=[])
