"""CLI do worker.

python -m worker load [--csv CAMINHO]                     # carrega o SAML-D no Postgres (uma vez)
python -m worker batch --week 2023-05-22 [--force] [--allow-in-sample]
python -m worker backfill [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--force] [--allow-in-sample]
python -m worker replay                                   # processa a próxima semana

Aqui ficam só os argumentos, o log e o código de saída; a lógica está em `worker/load.py` e
`worker/batch.py`. Sai com 0 quando dá certo ou não há nada a fazer, e com 1 em erro, com uma
mensagem que diz o que rodar.
"""

import argparse
import logging
from pathlib import Path
from time import perf_counter

from sqlalchemy.exc import OperationalError

from fraudradar.config import get_settings
from fraudradar.db import check_connection, get_engine
from worker.errors import WorkerError
from worker.weeks import parse_monday

log = logging.getLogger("worker")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m worker", description="Worker em lote do FraudRadar")
    sub = p.add_subparsers(dest="command", required=True)

    load = sub.add_parser("load", help="carrega o SAML-D no Postgres (uma vez, num banco vazio)")
    load.add_argument(
        "--csv", type=Path, help="caminho do SAML-D.csv (padrão: DATA_DIR/SAML-D.csv)"
    )

    reprocess = argparse.ArgumentParser(add_help=False)
    reprocess.add_argument(
        "--force",
        action="store_true",
        help="refaz semana já processada (recusado se já liberada ou com decisão de analista)",
    )
    reprocess.add_argument(
        "--allow-in-sample",
        action="store_true",
        help="aceita semana do período de treino do modelo (os números ficam otimistas)",
    )
    batch = sub.add_parser(
        "batch", parents=[reprocess], help="score, fila, evidências e métricas de uma semana"
    )
    batch.add_argument(
        "--week", required=True, metavar="AAAA-MM-DD", help="segunda-feira da semana"
    )
    backfill = sub.add_parser(
        "backfill",
        parents=[reprocess],
        help="processa várias semanas de uma vez (prepara o banco da demo)",
    )
    backfill.add_argument(
        "--from",
        dest="start",
        metavar="AAAA-MM-DD",
        help="primeira segunda (padrão: a primeira depois do treino do modelo)",
    )
    backfill.add_argument(
        "--to",
        dest="end",
        metavar="AAAA-MM-DD",
        help="última segunda (padrão: a última semana com transações)",
    )
    sub.add_parser(
        "replay",
        help="processa a próxima semana ainda não processada (liberar é o POST /replay/next-week)",
    )
    return p


def _require_database() -> None:
    ok, detail = check_connection()
    if not ok:
        raise WorkerError(
            f"banco indisponível ({detail}): suba com  docker compose up -d db  e confira"
            " DATABASE_URL no .env"
        )


def _thousands(number: int) -> str:
    return f"{number:,}".replace(",", ".")


def _load(args) -> int:
    from worker.load import check_csv, load_saml_d

    csv = check_csv(args.csv or get_settings().data_dir / "SAML-D.csv")
    _require_database()
    log.info("lendo %s", csv)
    result = load_saml_d(get_engine(), csv)
    if result.already_loaded:
        log.info(
            "o SAML-D já está no banco (%s transações): nada a fazer. Para carregar de novo,"
            " apague o banco (docker compose down -v)",
            _thousands(result.transactions),
        )
        return 0
    if result.rounded_amounts:
        log.info(
            "%s valores com mais de duas casas decimais arredondados para centavos (NUMERIC(14,2))",
            _thousands(result.rounded_amounts),
        )
    log.info(
        "carga pronta: %s transações, %s linhas de gabarito e %s contas em %.0f s",
        _thousands(result.transactions),
        _thousands(result.transactions),
        _thousands(result.accounts),
        result.seconds,
    )
    return 0


def _batch(args) -> int:
    # Os argumentos são conferidos antes de tudo: data errada não espera o banco nem o modelo.
    dates = {
        name: parse_monday(value, flag)
        for name, flag in (("week", "--week"), ("start", "--from"), ("end", "--to"))
        if (value := getattr(args, name, None)) is not None
    }
    _require_database()
    try:
        from worker import batch
    except ModuleNotFoundError as exc:  # lightgbm e scikit-learn ficam no grupo ml
        raise WorkerError(
            f"falta o pacote {exc.name}: o lote precisa do grupo ml (uv sync --group ml)"
        ) from exc
    clock = perf_counter()
    engine = get_engine()
    if args.command == "replay":
        result = batch.run_replay(engine)
    else:
        options = {"force": args.force, "allow_in_sample": args.allow_in_sample}
        if args.command == "batch":
            result = batch.run_batch(engine, dates["week"], **options)
        else:
            result = batch.run_backfill(engine, dates.get("start"), dates.get("end"), **options)
    for note in result.notes:
        log.info("%s", note)
    if result.processed:
        log.info(
            "pronto: %d semana(s) processada(s) em %.0f s; para mostrá-las no app, libere uma"
            " por vez (POST /replay/next-week)",
            len(result.processed),
            perf_counter() - clock,
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parser().parse_args(argv)
    try:
        return _load(args) if args.command == "load" else _batch(args)
    except WorkerError as exc:
        log.error("%s", exc)
        return 1
    except OperationalError as exc:  # o banco caiu no meio do caminho
        log.error(
            "banco indisponível (%s): suba com  docker compose up -d db  e rode de novo",
            type(exc.orig).__name__,
        )
        return 1
