"""Contratos das conexões com bancos externos: espelha web/src/features/ingestion/schemas/.

A senha só entra em ``ConnectionCreate`` (``SecretStr``) e nunca existe em uma resposta.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

from api.schemas.datasets import JobResponse

ConnectionStatus = Literal["untested", "connected", "incompatible", "error", "syncing"]
ImportMode = Literal["history", "follow", "both"]


class ConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=100)
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(min_length=1, max_length=63)
    user: str = Field(min_length=1, max_length=63)
    password: SecretStr = Field(min_length=1, max_length=500)
    table: str = Field(min_length=1, max_length=127)
    control_column: str | None = Field(default=None, min_length=1, max_length=63)


class CheckItem(BaseModel):
    key: str
    label: str
    status: Literal["ok", "fail", "info"]
    detail: str


class WrongType(BaseModel):
    column: str
    expected: str
    found: str


class SampleReport(BaseModel):
    size: int
    valid: bool
    errors: list[dict]


class OverlapReport(BaseModel):
    dataset: str
    sample_accounts: int
    known_accounts_pct: float | None
    dates: Literal["continue", "overlap", "other_era", "empty_dataset", "unknown"]
    dataset_first: str | None
    dataset_last: str | None


class Suggestion(BaseModel):
    relation: Literal["extend", "new_dataset"] | None
    message: str


class CompatibilityReport(BaseModel):
    compatible: bool
    checks: list[CheckItem]
    missing_columns: list[str]
    wrong_types: list[WrongType]
    has_ground_truth: bool
    has_typology: bool
    row_count: int | None
    date_first: str | None
    date_last: str | None
    sample: SampleReport
    overlap: OverlapReport | None
    suggestion: Suggestion | None


class Connection(BaseModel):
    id: str
    name: str
    type: Literal["postgres"] = "postgres"
    masked_host: str
    masked_database: str
    table: str
    control_column: str | None
    status: ConnectionStatus
    last_error: str | None
    last_synced_at: datetime | None
    dataset: str | None
    mode: ImportMode | None
    compatibility: CompatibilityReport | None


class Connections(BaseModel):
    items: list[Connection]


class NewDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=40)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relation: Literal["extend", "new_dataset"]
    new_dataset: NewDataset | None = None
    mode: ImportMode
    control_column: str = Field(min_length=1, max_length=63)

    @model_validator(mode="after")
    def _new_dataset_matches_relation(self) -> "ImportRequest":
        if self.relation == "new_dataset" and self.new_dataset is None:
            raise ValueError("Informe o nome e o slug do novo conjunto de dados.")
        if self.relation == "extend" and self.new_dataset is not None:
            raise ValueError("Continuar o conjunto atual não cria um conjunto novo.")
        return self


class ImportResponse(BaseModel):
    dataset: str
    job: JobResponse
