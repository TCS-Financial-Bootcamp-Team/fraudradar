"""Reconhece conversas curtas sem recuperação jurídica ou serviços externos."""

import re
import unicodedata
from typing import Literal

ChatIntent = Literal["greeting", "thanks", "farewell", "acknowledgement", "help"]

_PHRASES: dict[ChatIntent, set[str]] = {
    "greeting": {"oi", "ola", "bom dia", "boa tarde", "boa noite", "e ai", "hello", "hi"},
    "thanks": {"obrigado", "obrigada", "valeu", "thanks"},
    "farewell": {"tchau", "ate mais"},
    "acknowledgement": {"ok", "certo", "entendi", "beleza"},
    "help": {"quem e voce", "o que voce faz", "como voce pode ajudar", "ajuda", "help"},
}
_COURTESY_TAILS = ("tudo bem", "tudo bom", "como vai voce", "como vai", "td bem")
_LEGAL_KEYWORDS = {
    "lei",
    "art",
    "artigo",
    "artigos",
    "coaf",
    "pld",
    "lavagem",
    "juridico",
    "juridica",
    "obrigacao",
    "obrigacoes",
    "alerta",
    "risco",
    "relatorio",
    "comunicacao",
    "tipologia",
}
_REPLIES: dict[ChatIntent, str] = {
    "greeting": "Olá! Posso ajudar com dúvidas de PLD e com a análise de alertas.",
    "thanks": "Por nada! Posso ajudar com outra dúvida quando precisar.",
    "farewell": "Até mais! Estarei disponível para apoiar a próxima análise.",
    "acknowledgement": "Se precisar, posso explicar outro ponto da análise.",
    "help": (
        "Posso explicar as obrigações da Lei 9.613/1998, os sinais de risco do alerta "
        "e o fluxo do relatório ao COAF. "
        "Exemplos de perguntas: “O que exige o Art. 11?” "
        "e “O que verificar primeiro neste alerta?”."
    ),
}


def classify_legal_chat_intent(message: str) -> ChatIntent | None:
    """Aceita somente frases conhecidas; mensagens mistas seguem para a análise jurídica."""
    decomposed = unicodedata.normalize("NFKD", message.lower())
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    normalized = " ".join(re.sub(r"[^\w\s]|_", " ", unaccented).split())
    words = normalized.split()
    if not words or len(words) > 6 or _LEGAL_KEYWORDS.intersection(words):
        return None
    # "oi, tudo bem?" e "tudo bem?" são saudações; a cortesia no fim não muda a intenção.
    for tail in _COURTESY_TAILS:
        if normalized == tail:
            return "greeting"
        if normalized.endswith(f" {tail}"):
            normalized = normalized.removesuffix(f" {tail}")
            break
    return next((intent for intent, phrases in _PHRASES.items() if normalized in phrases), None)


def small_talk_reply(message: str) -> str | None:
    """Devolve uma resposta fixa sem repetir o texto recebido."""
    intent = classify_legal_chat_intent(message)
    return _REPLIES[intent] if intent is not None else None
