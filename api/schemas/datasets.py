"""Contratos da plataforma de conjuntos de dados e trabalhos."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DatasetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=40)


class DatasetResponse(BaseModel):
    slug: str
    name: str
    origin: Literal["saml-d", "external"]
    active_model_version: str | None
    created_at: datetime


class JobResponse(BaseModel):
    id: str
    kind: Literal["import", "process", "train"]
    dataset: str
    status: Literal["queued", "running", "done", "failed"]
    progress: int = Field(ge=0, le=100)
    message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
