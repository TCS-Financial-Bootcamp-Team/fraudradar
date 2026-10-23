from typing import Literal

from pydantic import BaseModel


class StatusBanco(BaseModel):
    ok: bool
    detalhe: str


class StatusModelo(BaseModel):
    ok: bool
    arquivo: str


class StatusLlm(BaseModel):
    ok: bool
    provedor: str


class Saude(BaseModel):
    status: Literal["ok", "degradado"]
    banco: StatusBanco
    modelo: StatusModelo
    llm: StatusLlm
