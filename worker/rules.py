"""Regras de cenário em SQL (`db/rules/NNN_rule_name.sql`, da frente 1) para `evidence.rules`.

Cada arquivo recebe a semana (`:week`, uma segunda-feira) e devolve `account, rule, detail`. O
código da regra vem do número no nome do arquivo: `001_cash_structuring.sql` vira "R-001". As
regras rodam na transação do lote da semana, antes de a fila ser gravada.
"""

import re
from collections import defaultdict
from datetime import date
from pathlib import Path

from sqlalchemy import Connection, text
from sqlalchemy.exc import DBAPIError

from fraudradar.config import ROOT_DIR
from worker.errors import WorkerError

RULES_DIR = ROOT_DIR / "db" / "rules"
_FILE_NAME = re.compile(r"(\d{3})_\w+\.sql")
_COLUMNS = {"account", "rule", "detail"}


def rule_files(folder: Path = RULES_DIR) -> list[tuple[str, Path]]:
    """(código, arquivo) de cada regra, na ordem do número. Um .sql fora do padrão é erro:
    regra que some em silêncio é pior que lote parado."""
    files = []
    for path in sorted(Path(folder).glob("*.sql")):
        match = _FILE_NAME.fullmatch(path.name)
        if match is None:
            raise WorkerError(
                f"regra fora do padrão NNN_nome.sql: {path.name} (veja db/rules/README.md)"
            )
        files.append((f"R-{match.group(1)}", path))
    return files


def run_rules(conn: Connection, week: date, folder: Path = RULES_DIR) -> dict[int, list[dict]]:
    """As regras que dispararam na semana, por conta: [{"code", "description", "detail"}]."""
    fired: dict[int, list[dict]] = defaultdict(list)
    for code, path in rule_files(folder):
        try:
            result = conn.execute(text(path.read_text(encoding="utf-8")), {"week": week})
        except DBAPIError as exc:
            raise WorkerError(f"a regra {path.name} falhou: {exc.orig}") from exc
        missing = _COLUMNS - set(result.keys())
        if missing:
            raise WorkerError(
                f"a regra {path.name} precisa devolver account, rule e detail;"
                f" faltou {', '.join(sorted(missing))}"
            )
        for row in result.mappings():
            fired[int(row["account"])].append(
                {"code": code, "description": str(row["rule"]), "detail": row["detail"]}
            )
    return dict(fired)
