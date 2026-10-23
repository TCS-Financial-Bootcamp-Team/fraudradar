"""CLI do worker.

python -m worker lote --semana 2023-01-02   # processa uma semana
python -m worker replay                     # avança a demo uma semana
"""

import argparse
import logging
from datetime import date

from fraudradar.banco import checar_conexao

log = logging.getLogger("worker")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="worker", description="Worker em lote do FraudRadar")
    sub = p.add_subparsers(dest="comando", required=True)
    lote = sub.add_parser("lote", help="score + fila + pareceres de uma semana")
    lote.add_argument("--semana", type=date.fromisoformat, required=True, help="segunda-feira")
    sub.add_parser("replay", help="processa a próxima semana ainda não vista (demo)")
    return p


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parser().parse_args(argv)

    ok, detalhe = checar_conexao()
    if not ok:
        log.error("banco indisponível (%s)", detalhe)
        return 1
    log.info("banco ok")

    if args.comando == "lote":
        log.warning("lote semanal (semana=%s) ainda não implementado", args.semana)
    else:
        log.warning("replay ainda não implementado")
    return 0
