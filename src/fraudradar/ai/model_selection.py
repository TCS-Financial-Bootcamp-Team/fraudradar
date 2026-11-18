"""Seleção de modelos Gemini permitidos e contingência automática em falhas 429/503."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from google.genai import errors as genai_errors

from fraudradar.ai.legal_generation import LegalLlmNotConfiguredError, gemini_settings
from fraudradar.config import get_settings

logger = logging.getLogger(__name__)

MODEL_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.\-]{0,63}$")


class InvalidModelError(ValueError):
    """Indica que o modelo solicitado não é permitido ou é desconhecido."""


@dataclass(frozen=True)
class ModelOption:
    """Opção de modelo exposta ao cliente."""

    id: str
    label: str


def model_label(model_id: str) -> str:
    """Deriva um rótulo legível a partir do identificador do modelo."""
    return " ".join(part.capitalize() for part in model_id.split("-") if part)


def is_valid_model_id(model_id: str) -> bool:
    """Valida o identificador contra o padrão permitido."""
    return isinstance(model_id, str) and MODEL_ID_PATTERN.fullmatch(model_id) is not None


def build_allowlist(default_model: str) -> list[str]:
    """Monta a lista de IDs permitidos a partir do modelo padrão e de LLM_MODEL_OPTIONS."""
    if not is_valid_model_id(default_model):
        logger.warning("LLM_MODEL configurado possui formato inválido e foi recusado.")
        raise LegalLlmNotConfiguredError("LLM_MODEL configurado é inválido.")

    seen: set[str] = {default_model}
    ordered_ids: list[str] = [default_model]

    raw_options = get_settings().llm_model_options or ""
    for raw_item in raw_options.split(","):
        candidate = raw_item.strip()
        if not candidate:
            continue
        if not is_valid_model_id(candidate):
            logger.warning(
                "Modelo inválido em LLM_MODEL_OPTIONS ignorado: %s",
                candidate[:64],
            )
            continue
        if candidate not in seen:
            seen.add(candidate)
            ordered_ids.append(candidate)

    return ordered_ids


def configured_model_options() -> tuple[str, list[ModelOption]]:
    """Devolve o modelo padrão e a lista de opções válidas configuradas.

    Exige configuração ativa do Gemini (`LLM_MODEL` válido e chave). Itens inválidos
    em `LLM_MODEL_OPTIONS` são descartados com aviso em log.
    """
    default_model, _ = gemini_settings()
    ordered_ids = build_allowlist(default_model)
    options = [ModelOption(id=item, label=model_label(item)) for item in ordered_ids]
    return default_model, options


def configured_model_allowlist() -> list[str]:
    """Devolve somente os identificadores permitidos, com o padrão em primeiro."""
    _, options = configured_model_options()
    return [option.id for option in options]


def validate_requested_model(requested: str | None) -> tuple[str, list[str]]:
    """Valida o modelo pedido na requisição e retorna `(modelo_escolhido, allowlist)`."""
    allowlist = configured_model_allowlist()
    if requested is None:
        return allowlist[0], allowlist
    if not isinstance(requested, str) or requested not in allowlist:
        raise InvalidModelError("O modelo de IA solicitado não é permitido.")
    return requested, allowlist


def next_fallback_model(model: str, allowlist: Sequence[str]) -> str | None:
    """Retorna o próximo modelo da lista para uma única tentativa de contingência."""
    if len(allowlist) <= 1:
        return None
    if model not in allowlist:
        return allowlist[0]
    index = allowlist.index(model)
    candidate = allowlist[(index + 1) % len(allowlist)]
    return candidate if candidate != model else None


def is_retryable_provider_error(error: Exception) -> bool:
    """Reconhece falhas transitórias 429 ou 503 do provedor Gemini."""
    if not isinstance(error, genai_errors.APIError):
        return False
    code = getattr(error, "code", None)
    status_code = getattr(error, "status_code", None)
    return code in (429, 503) or status_code in (429, 503)


def call_with_model_fallback[T](
    fn: Callable[[str], T],
    *,
    model: str,
    allowlist: Sequence[str] | None = None,
) -> tuple[T, str]:
    """Executa `fn(model)` e tenta UMA vez o próximo modelo em 429 ou 503."""
    candidates = [model]
    fallback = next_fallback_model(model, list(allowlist or ()))
    if fallback is not None:
        candidates.append(fallback)

    for index, candidate in enumerate(candidates):
        try:
            return fn(candidate), candidate
        except Exception as error:
            has_next = index + 1 < len(candidates)
            if has_next and is_retryable_provider_error(error):
                logger.warning(
                    "Modelo %s indisponível ou limitado (%s); tentando contingência %s.",
                    candidate,
                    getattr(error, "code", type(error).__name__),
                    candidates[index + 1],
                )
                continue
            raise

    raise AssertionError("Lista de modelos vazia.")
