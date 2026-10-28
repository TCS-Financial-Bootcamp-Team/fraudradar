"""Contrato do assistente: espelha web/src/features/assistente/schemas/assistente.ts."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from api.schemas.alertas import Fonte


class Mensagem(BaseModel):
    papel: Literal["usuario", "assistente"]
    texto: Annotated[str, StringConstraints(min_length=1, max_length=8000)]


class ContextoChat(BaseModel):
    pagina: str
    semana: str
    alerta_id: str | None = None


class PedidoChat(BaseModel):
    mensagem: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]
    contexto: ContextoChat
    historico: list[Mensagem] = Field(max_length=20)


class RespostaChat(BaseModel):
    resposta: str
    fontes: list[Fonte] = []
