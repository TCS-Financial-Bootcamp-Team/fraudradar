from typing import Literal

from pydantic import BaseModel


class DatabaseStatus(BaseModel):
    ok: bool
    detail: str


class ModelStatus(BaseModel):
    ok: bool
    file: str


class LlmStatus(BaseModel):
    ok: bool
    provider: str


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    database: DatabaseStatus
    model: ModelStatus
    llm: LlmStatus
