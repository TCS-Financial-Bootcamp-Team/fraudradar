"""Encaminha a resposta do chat ao contrato HTTP, sem acesso implícito ao banco."""

import inspect
from collections.abc import Callable, Sequence

from api.legal_chat_service import answer_legal_chat
from api.schemas.chat import ChatResponse
from fraudradar.ai.chat_router import ChatRoute
from fraudradar.ai.decision_chat import (
    generate_decision_answer_from_settings,
    generate_decision_answer_with_model,
    validate_decision_answer,
)
from fraudradar.ai.domain_chat import (
    OUT_OF_SCOPE_REPLY,
    generate_domain_answer_from_settings,
    generate_domain_answer_with_model,
    validate_domain_answer,
)
from fraudradar.ai.legal_chat_intent import small_talk_reply

_DEFAULT_DOMAIN_GENERATOR = generate_domain_answer_from_settings
_DEFAULT_DECISION_GENERATOR = generate_decision_answer_from_settings


def _call_injected(generator: Callable[..., str], *, question: str, model: str | None) -> str:
    if model is not None and "model" in inspect.signature(generator).parameters:
        return generator(question=question, model=model)
    return generator(question=question)


def answer_chat_message(
    question: str,
    *,
    route: ChatRoute,
    retrieval_query: str | None = None,
    model: str | None = None,
    allowlist: Sequence[str] | None = None,
    legal_answerer: Callable[..., ChatResponse] | None = None,
    domain_generator: Callable[..., str] | None = None,
    decision_generator: Callable[..., str] | None = None,
    system_runner: Callable[[], ChatResponse] | None = None,
) -> ChatResponse:
    """Gera somente no caminho escolhido; apenas o jurídico pode recuperar fontes."""
    if route == "legal":
        answerer = legal_answerer or answer_legal_chat
        extra_kwargs: dict[str, str] = {}
        if retrieval_query is not None:
            extra_kwargs["retrieval_query"] = retrieval_query
        if model is not None:
            extra_kwargs["model"] = model
        return answerer(question, **extra_kwargs)

    if route == "system":
        if system_runner is None:
            raise ValueError("Executor do agente do sistema não fornecido.")
        return system_runner()

    used_model: str | None = None
    if route == "small_talk":
        answer = small_talk_reply(question) or small_talk_reply("ajuda")
    elif route == "out_of_scope":
        answer = OUT_OF_SCOPE_REPLY
    elif route == "domain":
        if (
            domain_generator is None
            and generate_domain_answer_from_settings is _DEFAULT_DOMAIN_GENERATOR
        ):
            raw_answer, used_model = generate_domain_answer_with_model(
                question=question,
                model=model,
                allowlist=list(allowlist) if allowlist is not None else None,
            )
        else:
            generate = domain_generator or generate_domain_answer_from_settings
            raw_answer = _call_injected(generate, question=question, model=model)
            used_model = model
        answer = validate_domain_answer(raw_answer)
    elif route == "decision":
        if (
            decision_generator is None
            and generate_decision_answer_from_settings is _DEFAULT_DECISION_GENERATOR
        ):
            raw_answer, used_model = generate_decision_answer_with_model(
                question=question,
                model=model,
                allowlist=list(allowlist) if allowlist is not None else None,
            )
        else:
            generate = decision_generator or generate_decision_answer_from_settings
            raw_answer = _call_injected(generate, question=question, model=model)
            used_model = model
        answer = validate_decision_answer(raw_answer)
    else:
        raise ValueError("Rota de chat inválida.")

    return ChatResponse(kind=route, answer=answer, sources=[], links=[], model=used_model)
