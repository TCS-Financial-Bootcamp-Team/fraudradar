"""Rotas do chat jurídico, do agente do sistema e da assistência contextual de alertas.

As rotas de alerta e do agente abrem transações curtas apenas para ler ou gravar dados,
fechando o banco durante o RAG e as chamadas ao Gemini. A IA nunca toma a decisão.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Header, Path, Query, Response, status
from google.genai import errors as genai_errors

from api.alert_ai_service import prepare_alert_ai
from api.chat_service import answer_chat_message
from api.dependencies import CurrentUser, DbConnection
from api.domain import AlertId, get_alert_row
from api.errors import AppError
from api.legal_chat_service import LegalEvidenceUnavailableError, answer_legal_chat
from api.repositories import chat as chat_repo
from api.repositories.alert_assessments import (
    save_generated_assessment,
    validate_generated_assessment,
)
from api.schemas.alerts import Assessment
from api.schemas.chat import (
    ChatLink,
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationSummary,
    ModelOptionSchema,
    ModelsResponse,
)
from fraudradar.ai.alert_assessment import (
    AlertContextBlockedError,
    AlertQuestionTooLongError,
    build_alert_chat_request,
    build_assessment_request,
    build_global_chat_prompt,
    parse_suggested_typology,
)
from fraudradar.ai.chat_router import route_chat_message_with_model
from fraudradar.ai.legal_chat_adapter import LLM_UNAVAILABLE_ANSWER
from fraudradar.ai.legal_generation import (
    LegalAnswerRejectedError,
    LegalLlmNotConfiguredError,
    gemini_settings,
)
from fraudradar.ai.model_selection import (
    InvalidModelError,
    configured_model_options,
    validate_requested_model,
)
from fraudradar.ai.system_agent import run_system_agent, sanitize_page_context
from fraudradar.datasets import (
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)
from fraudradar.db import get_engine

router = APIRouter(tags=["ai"])

_RESPONSES = {503: {"description": "Serviço de IA temporariamente indisponível."}}

DatasetHeader = Annotated[str, Header(alias="X-Dataset")]
ConversationId = Annotated[int, Path(ge=1, le=2**63 - 1, description="id da conversa")]


def _set_dataset(conn, slug: str) -> str:
    """Aplica o mesmo isolamento por conjunto usado pelas demais rotas e retorna o slug."""
    try:
        dataset = resolve_dataset(conn, slug)
    except (DatasetNotFoundError, InvalidDatasetSlugError) as error:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "dataset.not_found",
            "Conjunto de dados não encontrado.",
            {"slug": slug},
        ) from error
    use_dataset(conn, dataset)
    return dataset.slug


def _set_timeout(conn) -> None:
    """Limita cada transação curta a quinze segundos."""
    conn.exec_driver_sql("SET LOCAL statement_timeout = '15s'")


def _translate_ai_error(error: Exception) -> AppError:
    """Traduz falhas comuns às rotas de IA sem expor detalhes internos."""
    if isinstance(error, LegalLlmNotConfiguredError):
        return AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.not_configured",
            "A IA não está configurada na API (defina LLM_MODEL e a chave do Gemini).",
        )
    if isinstance(error, LegalEvidenceUnavailableError):
        return AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.no_legal_sources",
            "Nenhuma fonte jurídica revisada está disponível.",
        )
    if isinstance(error, LegalAnswerRejectedError):
        return AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.provider_failed",
            "Não foi possível obter uma resposta válida do provedor de IA.",
        )
    if isinstance(error, TimeoutError):
        return _provider_unavailable()
    if isinstance(error, genai_errors.APIError):
        if error.code == 429:
            return AppError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "ai.provider_rate_limited",
                "O limite temporário do provedor de IA foi atingido.",
            )
        if error.code == 503:
            return _provider_unavailable()
        return AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.provider_failed",
            "Não foi possível obter uma resposta do provedor de IA.",
        )
    raise TypeError(f"Erro de IA sem tradução: {type(error).__name__}")


def _configured_model() -> str:
    """Verifica o Gemini antes de qualquer acesso ao banco e devolve o modelo."""
    try:
        model, _ = gemini_settings()
    except LegalLlmNotConfiguredError as error:
        raise _translate_ai_error(error) from error
    return model


def _validate_request_model(requested: str | None) -> tuple[str | None, list[str] | None]:
    """Valida o modelo escolhido pelo cliente quando informado."""
    if requested is None:
        return None, None
    try:
        return validate_requested_model(requested)
    except LegalLlmNotConfiguredError as error:
        raise _translate_ai_error(error) from error
    except InvalidModelError as error:
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.model_not_allowed",
            "O modelo de IA solicitado não é permitido.",
            {"model": requested[:64]},
        ) from error


def _context_blocked() -> AppError:
    return AppError(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "ai.context_blocked",
        "O parecer não foi gerado para proteger os dados das contas.",
    )


def _provider_unavailable() -> AppError:
    return AppError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "ai.provider_unavailable",
        "O provedor de IA está temporariamente indisponível.",
    )


def _question_too_long() -> AppError:
    return AppError(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "ai.question_too_long",
        "A pergunta, o histórico e o resumo do alerta excedem o limite seguro.",
    )


def _load_db_history(*, conversation_id: int, owner_id: str, dataset: str) -> list[dict[str, str]]:
    """Carrega em transação curta o histórico da conversa pertencente ao usuário."""
    with get_engine().begin() as conn:
        _set_timeout(conn)
        resolved = _set_dataset(conn, dataset)
        return chat_repo.load_conversation_history(
            conn,
            conversation_id=conversation_id,
            owner_id=owner_id,
            dataset=resolved,
        )


def _persist_chat_turn(
    *,
    conversation_id: int | None,
    owner_id: str,
    dataset: str,
    user_message: str,
    response: ChatResponse,
) -> int:
    """Persiste pergunta e resposta em uma transação curta após resposta bem-sucedida."""
    with get_engine().begin() as conn:
        _set_timeout(conn)
        resolved = _set_dataset(conn, dataset)
        return chat_repo.save_conversation_turn(
            conn,
            conversation_id=conversation_id,
            owner_id=owner_id,
            dataset=resolved,
            user_message=user_message,
            response=response,
        )


def _make_agent_tools(
    *,
    dataset: str,
    request: ChatRequest,
    forbidden_identifiers: set[str],
) -> dict[str, Callable[..., Any]]:
    """Cria os handlers somente leitura do agente, cada um com sua transação curta."""

    def _run_in_tx(fn: Callable[[Any, str], Any]) -> Any:
        with get_engine().begin() as conn:
            _set_timeout(conn)
            resolved = _set_dataset(conn, dataset)
            return fn(conn, resolved)

    def search_alerts(**kwargs: Any) -> dict[str, Any]:
        return _run_in_tx(
            lambda conn, _ds: chat_repo.search_alerts_for_agent(
                conn,
                week=kwargs.get("week"),
                status_filter=kwargs.get("status"),
                decision=kwargs.get("decision"),
                min_score=kwargs.get("min_score"),
                max_score=kwargs.get("max_score"),
                typology=kwargs.get("typology"),
                origin=kwargs.get("origin"),
                order_by=kwargs.get("order_by", "score"),
                limit=kwargs.get("limit", 10),
                forbidden_identifiers=forbidden_identifiers,
            )
        )

    def get_alert(*, alert_id: int) -> dict[str, Any]:
        return _run_in_tx(
            lambda conn, _ds: chat_repo.get_alert_summary_for_agent(
                conn,
                alert_id,
                forbidden_identifiers=forbidden_identifiers,
            )
        )

    def list_weeks() -> dict[str, Any]:
        return _run_in_tx(
            lambda conn, resolved: chat_repo.list_weeks_for_agent(conn, dataset_slug=resolved)
        )

    def get_week_summary(*, week: str) -> dict[str, Any]:
        return _run_in_tx(
            lambda conn, _ds: chat_repo.get_week_summary_for_agent(conn, week_str=week)
        )

    def get_page_items() -> dict[str, Any]:
        page_state = request.context.page_state
        visible_ids = list(page_state.visible_alert_ids) if page_state else []
        alerts = (
            _run_in_tx(
                lambda conn, _ds: chat_repo.get_visible_alerts_for_agent(
                    conn,
                    alert_ids=visible_ids,
                    forbidden_identifiers=forbidden_identifiers,
                )
            )
            if visible_ids
            else []
        )
        safe_context = sanitize_page_context(
            request.context.model_dump(mode="json"),
            forbidden_values=forbidden_identifiers,
        )
        safe_state = safe_context.get("page_state") or {}
        return {
            "path": safe_context.get("path") or request.context.page,
            "week": safe_context.get("week") or request.context.week,
            "filters": safe_state.get("filters", {}),
            "page": safe_state.get("page"),
            "visible_alerts": alerts,
            "returned_count": len(alerts),
        }

    return {
        "search_alerts": search_alerts,
        "get_alert": get_alert,
        "list_weeks": list_weeks,
        "get_week_summary": get_week_summary,
        "get_page_items": get_page_items,
    }


@router.get("/ai/models", response_model=ModelsResponse, responses=_RESPONSES)
def list_ai_models() -> ModelsResponse:
    """Lista o modelo padrão e as opções Gemini permitidas na API."""
    try:
        default_model, options = configured_model_options()
    except LegalLlmNotConfiguredError as error:
        raise _translate_ai_error(error) from error
    return ModelsResponse(
        default=default_model,
        models=[ModelOptionSchema(id=item.id, label=item.label) for item in options],
    )


@router.get("/chat/conversations", response_model=list[ConversationSummary])
def get_chat_conversations(
    user: CurrentUser,
    conn: DbConnection,
    x_dataset: DatasetHeader = "saml-d",
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[ConversationSummary]:
    """Lista as conversas do analista autenticado no conjunto de dados atual."""
    dataset = resolve_dataset(conn, x_dataset).slug
    return chat_repo.list_conversations(conn, owner_id=user.id, dataset=dataset, limit=limit)


@router.get("/chat/conversations/{conversation_id}", response_model=ConversationDetail)
def get_chat_conversation(
    conversation_id: ConversationId,
    user: CurrentUser,
    conn: DbConnection,
    x_dataset: DatasetHeader = "saml-d",
) -> ConversationDetail:
    """Carrega uma conversa completa do analista autenticado."""
    dataset = resolve_dataset(conn, x_dataset).slug
    return chat_repo.get_conversation_detail(
        conn, conversation_id=conversation_id, owner_id=user.id, dataset=dataset
    )


@router.delete(
    "/chat/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_chat_conversation(
    conversation_id: ConversationId,
    user: CurrentUser,
    conn: DbConnection,
    x_dataset: DatasetHeader = "saml-d",
) -> Response:
    """Exclui uma conversa do analista autenticado."""
    dataset = resolve_dataset(conn, x_dataset).slug
    chat_repo.delete_conversation(
        conn, conversation_id=conversation_id, owner_id=user.id, dataset=dataset
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/alerts/{alert_id}/assessment",
    response_model=Assessment,
    responses=_RESPONSES,
)
def generate_assessment(
    alert_id: AlertId,
    user: CurrentUser,
    x_dataset: DatasetHeader = "saml-d",
) -> Assessment:
    """Gera, valida e persiste um rascunho de parecer para revisão humana."""
    model = _configured_model()
    engine = get_engine()

    try:
        with engine.begin() as conn:
            _set_timeout(conn)
            _set_dataset(conn, x_dataset)
            prepared = prepare_alert_ai(conn, alert_id)
        request = build_assessment_request(prepared)
    except AlertQuestionTooLongError as error:
        raise _question_too_long() from error
    except AlertContextBlockedError as error:
        raise _context_blocked() from error

    try:
        generated = answer_legal_chat(
            request.prompt,
            retrieval_query=request.retrieval_query,
            system_instruction=request.system_instruction,
            max_output_tokens=request.max_output_tokens,
        )
    except (
        LegalLlmNotConfiguredError,
        LegalEvidenceUnavailableError,
        LegalAnswerRejectedError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error

    if generated.answer == LLM_UNAVAILABLE_ANSWER:
        raise _provider_unavailable()

    parsed = parse_suggested_typology(generated.answer)
    assessment = Assessment(content=parsed.content, sources=generated.sources)
    try:
        validate_generated_assessment(assessment)
    except ValueError as error:
        raise AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.invalid_assessment",
            "O parecer gerado não passou na validação.",
        ) from error

    with engine.begin() as conn:
        _set_timeout(conn)
        _set_dataset(conn, x_dataset)
        get_alert_row(conn, alert_id)
        save_generated_assessment(
            conn,
            alert_id=alert_id,
            assessment=assessment,
            model=model,
            suggested_typology=parsed.suggested_typology,
            user=user,
        )
    return assessment


def _run_system_route(
    *,
    dataset: str,
    request: ChatRequest,
    history: Sequence[dict[str, str]],
    page_context: Mapping[str, Any],
    active_model: str | None,
    allowlist: Sequence[str] | None,
) -> ChatResponse:
    """Executa o agente do sistema com ferramentas isoladas por conjunto de dados."""
    forbidden_ids: set[str] = set()
    tools = _make_agent_tools(
        dataset=dataset,
        request=request,
        forbidden_identifiers=forbidden_ids,
    )

    def _run_system() -> ChatResponse:
        agent_result = run_system_agent(
            question=request.message,
            tools=tools,
            history=history,
            page_context=page_context,
            forbidden_identifiers=forbidden_ids,
            model=active_model,
            allowlist=allowlist,
        )
        return ChatResponse(
            kind="system",
            answer=agent_result.answer,
            sources=[],
            links=[ChatLink(**item) for item in agent_result.links],
            model=agent_result.model,
        )

    return answer_chat_message(
        request.message,
        route="system",
        system_runner=_run_system,
    )


@router.post(
    "/alerts/{alert_id}/chat",
    response_model=ChatResponse,
    responses=_RESPONSES,
)
def chat_about_alert(
    alert_id: AlertId,
    request: ChatRequest,
    user: CurrentUser,
    x_dataset: DatasetHeader = "saml-d",
) -> ChatResponse:
    """Encaminha dúvidas sobre um alerta ao agente do sistema, decisão, domínio ou base jurídica."""
    if request.context.alert_id is not None and request.context.alert_id != str(alert_id):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.alert_context_mismatch",
            "O alerta informado não corresponde ao alerta selecionado.",
        )

    selected_model, allowlist = _validate_request_model(request.model)

    if request.conversation_id is not None:
        effective_history: Sequence[dict[str, str]] = _load_db_history(
            conversation_id=request.conversation_id,
            owner_id=user.id,
            dataset=x_dataset,
        )
    else:
        effective_history = [item.model_dump() for item in request.history]

    try:
        route, active_model = route_chat_message_with_model(
            request.message,
            has_alert_context=True,
            model=selected_model,
            allowlist=allowlist,
        )
        if route in {"small_talk", "out_of_scope"}:
            response = answer_chat_message(request.message, route=route)
        elif route == "system":
            page_context = request.context.model_dump(mode="json")
            page_context["page"] = "alert"
            page_context["alert_id"] = alert_id
            response = _run_system_route(
                dataset=x_dataset,
                request=request,
                history=effective_history,
                page_context=page_context,
                active_model=active_model,
                allowlist=allowlist,
            )
        else:
            if active_model is None:
                _configured_model()
            engine = get_engine()
            with engine.begin() as conn:
                _set_timeout(conn)
                _set_dataset(conn, x_dataset)
                prepared = prepare_alert_ai(conn, alert_id)
            chat_request = build_alert_chat_request(
                prepared,
                request.message,
                cite_legal_sources=route == "legal",
                history=effective_history,
            )
            response = answer_chat_message(
                chat_request.prompt,
                route=route,
                retrieval_query=chat_request.retrieval_query,
                model=active_model,
                allowlist=allowlist,
                legal_answerer=answer_legal_chat,
            )
    except AlertQuestionTooLongError as error:
        raise _question_too_long() from error
    except AlertContextBlockedError as error:
        raise _context_blocked() from error
    except (
        LegalLlmNotConfiguredError,
        LegalEvidenceUnavailableError,
        LegalAnswerRejectedError,
        TimeoutError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error

    conversation_id = _persist_chat_turn(
        conversation_id=request.conversation_id,
        owner_id=user.id,
        dataset=x_dataset,
        user_message=request.message,
        response=response,
    )
    response.conversation_id = conversation_id
    return response


@router.post("/chat", response_model=ChatResponse, responses=_RESPONSES)
def chat(
    request: ChatRequest,
    user: CurrentUser,
    x_dataset: DatasetHeader = "saml-d",
) -> ChatResponse:
    """Encaminha perguntas gerais ao agente do sistema, domínio, base jurídica ou respostas."""
    if request.context.alert_id is not None:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            "ai.chat_alert_route",
            "Use a rota de chat do alerta para perguntas sobre alertas.",
        )
    if re.search(
        r"\d{5,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|"
        r"\b(?:contas?|accounts?)\s*(?:n[º°o.]?\s*|número\s*|#\s*|:\s*)?\d",
        request.message,
        re.IGNORECASE,
    ):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.chat_personal_data",
            "Remova identificadores pessoais ou financeiros da pergunta.",
        )

    selected_model, allowlist = _validate_request_model(request.model)

    if request.conversation_id is not None:
        effective_history: Sequence[dict[str, str]] = _load_db_history(
            conversation_id=request.conversation_id,
            owner_id=user.id,
            dataset=x_dataset,
        )
    else:
        effective_history = [item.model_dump() for item in request.history]

    try:
        route, active_model = route_chat_message_with_model(
            request.message,
            has_alert_context=False,
            model=selected_model,
            allowlist=allowlist,
        )
        if route == "system":
            response = _run_system_route(
                dataset=x_dataset,
                request=request,
                history=effective_history,
                page_context=request.context.model_dump(mode="json"),
                active_model=active_model,
                allowlist=allowlist,
            )
        else:
            question = (
                build_global_chat_prompt(request.message, effective_history)
                if route == "domain"
                else request.message
            )
            response = answer_chat_message(
                question,
                route=route,
                model=active_model,
                allowlist=allowlist,
                legal_answerer=answer_legal_chat,
            )
    except AlertQuestionTooLongError as error:
        raise _question_too_long() from error
    except AlertContextBlockedError as error:
        raise _context_blocked() from error
    except (
        LegalLlmNotConfiguredError,
        LegalEvidenceUnavailableError,
        LegalAnswerRejectedError,
        TimeoutError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error

    conversation_id = _persist_chat_turn(
        conversation_id=request.conversation_id,
        owner_id=user.id,
        dataset=x_dataset,
        user_message=request.message,
        response=response,
    )
    response.conversation_id = conversation_id
    return response
