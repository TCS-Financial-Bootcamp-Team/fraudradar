"""Contrato do assistente: espelha web/src/features/assistant/schemas/assistant.ts."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from api.schemas.alerts import Source


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(min_length=1, max_length=8000)]


class ChatContext(BaseModel):
    page: str
    week: str
    alert_id: str | None = None


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    context: ChatContext
    history: list[Message] = Field(max_length=20)


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source] = []
