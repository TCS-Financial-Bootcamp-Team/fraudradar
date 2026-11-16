"""Erros que a pessoa resolve sozinha: a mensagem diz o que aconteceu e o que rodar."""

from typing import Any


class WorkerError(Exception):
    """O worker não pode fazer o que foi pedido (semana inválida, modelo ausente, carga ou
    reprocessamento recusados...). A CLI mostra a mensagem e sai com código 1.

    ``code`` e ``params`` (ou uma ``fraudradar.messages.Msg`` no lugar da mensagem) vão para
    ``jobs.message_code``/``message_params`` quando o erro derruba um trabalho: o front traduz
    por eles e cai no texto em português se não conhecer o código."""

    def __init__(
        self, message: object, code: str | None = None, params: dict[str, Any] | None = None
    ) -> None:
        super().__init__(str(message))
        self.code: str | None = code or getattr(message, "code", None)
        self.params: dict[str, Any] = dict(params or getattr(message, "params", None) or {})
