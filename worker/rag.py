"""Carga do RAG jurídico: os snapshots de rag/snapshots/ em rag_documents (`worker rag-load`).

A lógica de cada snapshot (conferir os hashes, dividir os artigos, gerar os embeddings e gravar)
fica em fraudradar.ai.legal_ingestion; aqui ficam só a leitura dos arquivos e a transação.
O chat jurídico (POST /chat) lê de rag_documents no schema public.
"""

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

from sqlalchemy import Engine

from worker.errors import WorkerError

if TYPE_CHECKING:
    from fraudradar.ai.legal_ingestion import LegalSnapshotLoad


def read_snapshots(folder: Path) -> list[tuple[str, dict[str, Any]]]:
    """Lê os `*.json` da pasta, em ordem de nome. Arquivo ilegível vira WorkerError."""
    if not folder.is_dir():
        raise WorkerError(f"pasta de snapshots não encontrada: {folder}")
    paths = sorted(folder.glob("*.json"))
    if not paths:
        raise WorkerError(f"nenhum snapshot (*.json) em {folder}")
    snapshots = []
    for path in paths:
        try:
            snapshot = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WorkerError(f"{path.name}: não deu para ler o JSON ({exc})") from exc
        if not isinstance(snapshot, dict):
            raise WorkerError(f"{path.name}: o snapshot precisa ser um objeto JSON")
        snapshots.append((path.name, snapshot))
    return snapshots


def load_snapshots(
    engine: Engine, snapshots: list[tuple[str, dict[str, Any]]]
) -> list[tuple[str, "LegalSnapshotLoad"]]:
    """Carrega todos numa transação só: se um falhar, nada é gravado."""
    try:
        # Importa o sentence-transformers (e o torch): só quando o comando roda.
        from fraudradar.ai.legal_ingestion import load_legal_snapshot
    except ModuleNotFoundError as exc:
        raise WorkerError(
            f"falta o pacote {exc.name}: a carga do RAG precisa do grupo ai (uv sync --group ai)"
        ) from exc
    results = []
    with engine.begin() as conn:
        for name, snapshot in snapshots:
            try:
                results.append((name, load_legal_snapshot(conn, snapshot)))
            except (KeyError, TypeError, ValueError) as exc:
                raise WorkerError(f"{name}: {exc!r}; nada foi gravado") from exc
    return results
