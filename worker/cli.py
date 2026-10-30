"""CLI do worker.

python -m worker batch --week 2023-01-02   # processa uma semana
python -m worker replay                    # avança a demo uma semana
"""

import argparse
import logging
from datetime import date

from fraudradar.db import check_connection

log = logging.getLogger("worker")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="worker", description="Worker em lote do FraudRadar")
    sub = p.add_subparsers(dest="command", required=True)
    batch = sub.add_parser("batch", help="score + fila + pareceres de uma semana")
    batch.add_argument("--week", type=date.fromisoformat, required=True, help="segunda-feira")
    sub.add_parser("replay", help="processa a próxima semana ainda não vista (demo)")
    return p


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parser().parse_args(argv)

    ok, detail = check_connection()
    if not ok:
        log.error("banco indisponível (%s)", detail)
        return 1
    log.info("banco ok")

    if args.command == "batch":
        log.warning("lote semanal (week=%s) ainda não implementado", args.week)
    else:
        log.warning("replay ainda não implementado")
    return 0
