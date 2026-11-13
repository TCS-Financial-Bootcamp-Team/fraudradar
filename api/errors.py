"""Erro de API que chega às telas: texto em português, código estável e parâmetros.

``AppError`` é um ``HTTPException`` (o rollback da transação e os ``except HTTPException`` seguem
valendo). O corpo da resposta é ``{"detail": "<texto em português>", "code": "<area.codigo>",
"params": {...}}``: ``detail`` continua sendo o que os clientes antigos leem, e o front traduz pelo
``code`` + ``params`` (``web/messages/<idioma>/errors.json``, ``errors.api``). Erro que não usa
``AppError`` segue devolvendo só ``detail``.
"""

from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from fraudradar.messages import Msg


class AppError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: Any,
        params: Mapping[str, Any] | None = None,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code
        self.params: dict[str, Any] = dict(params or {})

    @classmethod
    def from_msg(
        cls, status_code: int, message: Msg, *, headers: dict[str, str] | None = None
    ) -> "AppError":
        return cls(status_code, message.code, message.text, message.params, headers=headers)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder({"detail": exc.detail, "code": exc.code, "params": exc.params}),
        headers=exc.headers,
    )
