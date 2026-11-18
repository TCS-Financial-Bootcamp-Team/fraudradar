"""Contrato do assistente: espelha web/src/features/assistant/schemas/assistant.ts."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

from api.schemas.alerts import Source

FilterValue = Annotated[str, StringConstraints(max_length=100)] | int | float | bool | None


class ModelOptionSchema(BaseModel):
    id: str
    label: str


class ModelsResponse(BaseModel):
    default: str
    models: list[ModelOptionSchema]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(min_length=1, max_length=8000)]


class PageState(BaseModel):
    filters: dict[str, FilterValue] = Field(default_factory=dict)
    visible_alert_ids: list[int] = Field(default_factory=list, max_length=100)
    page: int | None = Field(default=None, ge=1)
    total: int | None = Field(default=None, ge=0)

    @field_validator("filters")
    @classmethod
    def _validate_filters(cls, value: dict[str, FilterValue]) -> dict[str, FilterValue]:
        if len(value) > 20:
            raise ValueError("Máximo de 20 filtros permitidos em page_state.")
        for key in value:
            if not isinstance(key, str) or not key or len(key) > 40:
                raise ValueError("Cada chave de filtro deve ter entre 1 e 40 caracteres.")
        return value

    @field_validator("visible_alert_ids", mode="before")
    @classmethod
    def _reject_booleans(cls, value: object) -> object:
        if isinstance(value, list) and any(isinstance(item, bool) for item in value):
            raise ValueError("visible_alert_ids deve conter apenas inteiros.")
        return value


class ChatContext(BaseModel):
    page: str
    week: str
    alert_id: str | None = None
    path: Annotated[str, StringConstraints(min_length=1, max_length=200)] | None = None
    page_state: PageState | None = None

    @field_validator("path")
    @classmethod
    def _validate_path(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith("/"):
            raise ValueError("O caminho da página deve começar com '/'.")
        return value


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    context: ChatContext
    history: list[Message] = Field(default_factory=list, max_length=20)
    model: str | None = None
    conversation_id: int | None = Field(default=None, ge=1)


class ChatLink(BaseModel):
    href: str
    label: Annotated[str, StringConstraints(min_length=1, max_length=60)]


class ChatResponse(BaseModel):
    kind: Literal["small_talk", "legal", "domain", "decision", "system", "out_of_scope"]
    answer: str
    sources: list[Source] = []
    links: list[ChatLink] = Field(default_factory=list, max_length=5)
    model: str | None = None
    conversation_id: int | None = None


class ConversationSummary(BaseModel):
    id: int
    title: str
    updated_at: datetime
    message_count: int


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    kind: str | None = None
    sources: list[Source] = []
    links: list[ChatLink] = []
    model: str | None = None
    created_at: datetime


class ConversationDetail(BaseModel):
    id: int
    title: str
    updated_at: datetime
    messages: list[ConversationMessage]
