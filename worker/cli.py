"""CLI do worker.

python -m worker load [--csv CAMINHO]                     # carrega o SAML-D no Postgres (uma vez)
python -m worker batch --week 2023-05-22 [--force] [--allow-in-sample]
python -m worker backfill [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--force] [--allow-in-sample]
python -m worker replay                         # compatibilidade: processa a próxima semana
python -m worker labels [--dataset SLUG]        # mede o gabarito e grava no registro dos conjuntos
python -m worker simulate-analyst [--dataset SLUG] [--from DATA] [--to DATA] [--error-rate 0.1]
                                  [--insufficient-rate 0.2] [--seed N] [--undo]
python -m worker feedback-eval [--dataset SLUG] [--include-simulated]
python -m worker rag-load [--snapshots PASTA]   # carrega a base do chat jurídico (rag_documents)

Aqui ficam só os argumentos, o log e o código de saída; a lógica está em `worker/load.py`,
`worker/batch.py`, `worker/labels.py`, `worker/simulate_analyst.py`, `worker/feedback_eval.py`
e `worker/rag.py`.
Sai com 0 quando dá certo ou não há nada a fazer, e com 1 em erro, com uma mensagem que diz o
que rodar.
"""

import argparse
import logging
from datetime import date
from pathlib import Path
from time import perf_counter

from sqlalchemy.exc import OperationalError

from fraudradar.config import ROOT_DIR, get_settings
from fraudradar.datasets import (
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
)
from fraudradar.db import check_connection, get_engine
from worker.errors import WorkerError
from worker.weeks import parse_monday

log = logging.getLogger("worker")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m worker", description="Worker em lote do FraudRadar")
    sub = p.add_subparsers(dest="command", required=True)

    scoped = argparse.ArgumentParser(add_help=False)
    scoped.add_argument(
        "--dataset", default="saml-d", metavar="SLUG", help="conjunto de dados (padrão: saml-d)"
    )

    load = sub.add_parser(
        "load", parents=[scoped], help="carrega o SAML-D no Postgres (uma vez, num banco vazio)"
    )
    load.add_argument(
        "--csv", type=Path, help="caminho do SAML-D.csv (padrão: DATA_DIR/SAML-D.csv)"
    )

    reprocess = argparse.ArgumentParser(add_help=False)
    reprocess.add_argument(
        "--force",
        action="store_true",
        help="refaz semana já processada (recusado se houver trabalho de analista)",
    )
    reprocess.add_argument(
        "--allow-in-sample",
        action="store_true",
        help=(
            "aceita semana do período de treino do modelo no conjunto em que ele treinou (os"
            " números ficam otimistas); nos outros conjuntos toda semana já é aceita"
        ),
    )
    batch = sub.add_parser(
        "batch",
        parents=[scoped, reprocess],
        help="score, fila, evidências e métricas de uma semana",
    )
    batch.add_argument(
        "--week", required=True, metavar="AAAA-MM-DD", help="segunda-feira da semana"
    )
    backfill = sub.add_parser(
        "backfill",
        parents=[scoped, reprocess],
        help="processa várias semanas de uma vez (prepara o banco da demo)",
    )
    backfill.add_argument(
        "--from",
        dest="start",
        metavar="AAAA-MM-DD",
        help=(
            "primeira segunda (padrão: a primeira depois do treino do modelo; em outro conjunto,"
            " a primeira com transações)"
        ),
    )
    backfill.add_argument(
        "--to",
        dest="end",
        metavar="AAAA-MM-DD",
        help="última segunda (padrão: a última semana com transações)",
    )
    sub.add_parser(
        "replay",
        parents=[scoped],
        help="compatibilidade: processa a próxima semana ainda não processada",
    )
    sub.add_parser("serve", help="executa os trabalhos em segundo plano")
    labels = sub.add_parser(
        "labels",
        help=(
            "mede de novo o gabarito (semanas rotuladas e se há lavagem) e grava no registro"
            " dos conjuntos, que a API usa para liberar o retreino"
        ),
    )
    labels.add_argument(
        "--dataset", metavar="SLUG", help="só este conjunto (padrão: todos os registrados)"
    )
    simulate = sub.add_parser(
        "simulate-analyst",
        parents=[scoped],
        help=(
            "decide pelo gabarito os alertas sem decisão das semanas fechadas (demonstração do"
            " retorno dos analistas; docs/analyst-feedback.md)"
        ),
    )
    simulate.add_argument(
        "--from", dest="start", metavar="AAAA-MM-DD", help="primeira data (padrão: o início)"
    )
    simulate.add_argument(
        "--to", dest="end", metavar="AAAA-MM-DD", help="última data (padrão: a última fechada)"
    )
    simulate.add_argument(
        "--error-rate", type=float, default=0.1, help="chance de a conclusão sair trocada (0,1)"
    )
    simulate.add_argument(
        "--insufficient-rate",
        type=float,
        default=0.2,
        help="chance de um arquivamento sair sem evidência suficiente, sem rótulo (0,2)",
    )
    simulate.add_argument("--seed", type=int, default=108, help="semente do sorteio (108)")
    simulate.add_argument(
        "--undo",
        action="store_true",
        help="desfaz: apaga as decisões e os rótulos simulados e volta os alertas para new",
    )
    evaluate = sub.add_parser(
        "feedback-eval",
        parents=[scoped],
        help=(
            "treina, na mesma divisão, um modelo só com o gabarito e outro com o retorno dos"
            " analistas e grava a comparação em models/<slug>/feedback-eval-*.json"
        ),
    )
    evaluate.add_argument(
        "--include-simulated", action="store_true", help="inclui o retorno do analista simulado"
    )
    rag_load = sub.add_parser(
        "rag-load",
        help=(
            "carrega os snapshots de rag/snapshots/ em rag_documents, a base do chat jurídico;"
            " rodar de novo só refaz o que mudou"
        ),
    )
    rag_load.add_argument(
        "--snapshots",
        type=Path,
        default=ROOT_DIR / "rag" / "snapshots",
        metavar="PASTA",
        help="pasta dos snapshots (padrão: rag/snapshots)",
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


def _dataset(slug: str):
    with get_engine().connect() as conn:
        try:
            return resolve_dataset(conn, slug)
        except (DatasetNotFoundError, InvalidDatasetSlugError) as exc:
            raise WorkerError(f"conjunto de dados '{slug}' não encontrado") from exc


def _load(args) -> int:
    from worker.load import check_csv, load_saml_d

    csv = check_csv(args.csv or get_settings().data_dir / "SAML-D.csv")
    _require_database()
    log.info("lendo %s", csv)
    result = load_saml_d(get_engine(), csv, dataset=_dataset(args.dataset))
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


def _labels(args) -> int:
    from worker.labels import refresh_registry

    _require_database()
    datasets = None if args.dataset is None else [_dataset(args.dataset)]
    measured = refresh_registry(get_engine(), datasets)
    if not measured:
        log.info("nenhum conjunto de dados registrado: nada a medir")
    for slug, stats in measured.items():
        log.info(
            "%s: %d semana(s) com gabarito, %s",
            slug,
            stats.labeled_weeks,
            "com lavagem" if stats.has_laundering else "sem lavagem marcada",
        )
    return 0


def _parse_date(value: str | None, flag: str) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise WorkerError(f"{flag} {value}: use a data no formato AAAA-MM-DD") from None


def _simulate(args) -> int:
    from worker.simulate_analyst import _check_rate, simulate_analyst, undo_simulation

    start = _parse_date(args.start, "--from")
    end = _parse_date(args.end, "--to")
    _check_rate("--error-rate", args.error_rate)
    _check_rate("--insufficient-rate", args.insufficient_rate)
    _require_database()
    dataset = _dataset(args.dataset)
    if args.undo:
        undone = undo_simulation(get_engine(), dataset)
        log.info(
            "simulação desfeita: %d decisões e %d rótulos apagados, %d alertas de volta a new",
            undone.decisions,
            undone.labels,
            undone.alerts_reset,
        )
        return 0
    result = simulate_analyst(
        get_engine(),
        dataset,
        start=start,
        end=end,
        error_rate=args.error_rate,
        insufficient_rate=args.insufficient_rate,
        seed=args.seed,
    )
    if not result.decided:
        log.info("nada a decidir: nenhum alerta sem decisão nas semanas fechadas pedidas")
        return 0
    log.info(
        "%d alertas decididos em %d semana(s) (%s a %s): %d comunicados, %d falsos positivos"
        " confirmados, %d sem evidência suficiente (sem rótulo); %d com a conclusão trocada de"
        " propósito",
        result.decided,
        len(result.weeks),
        result.weeks[0].isoformat(),
        result.weeks[-1].isoformat(),
        result.reported,
        result.false_positive,
        result.insufficient_evidence,
        result.flipped,
    )
    if result.without_truth:
        log.info("%d alertas sem transação rotulada ficaram sem decisão", result.without_truth)
    return 0


def _feedback_eval(args) -> int:
    _require_database()
    try:
        from worker.feedback_eval import run_feedback_eval
    except ModuleNotFoundError as exc:  # lightgbm e scikit-learn ficam no grupo ml
        raise WorkerError(
            f"falta o pacote {exc.name}: o experimento precisa do grupo ml (uv sync --group ml)"
        ) from exc
    clock = perf_counter()
    path, result = run_feedback_eval(
        get_engine(), _dataset(args.dataset), include_simulated=args.include_simulated
    )

    def number(value, spec: str) -> str:
        return "-" if value is None else format(value, spec).replace(".", ",")

    def line(name: str, metrics: dict) -> str:
        return (
            f"{name}: PR-AUC {number(metrics['pr_auc'], '.3f')}, recall com 0,13% de falso"
            f" positivo {number(metrics['recall_at_fpr'], '.1%')}; fila com corte: recall"
            f" {number(metrics['queue_recall'], '.1%')}, precisão"
            f" {number(metrics['queue_precision'], '.1%')},"
            f" {number(metrics['innocents_per_week'], '.1f')} inocentes por semana"
        )

    log.info("treino até %s; teste depois disso", result["split"]["train_end"])
    log.info("%s", line("controle (só o gabarito)", result["control"]))
    log.info("%s", line("tratamento (gabarito + retorno)", result["treatment"]))
    log.info("resultado em %s (%.0f s)", path, perf_counter() - clock)
    return 0


def _rag_load(args) -> int:
    from worker.rag import load_snapshots, read_snapshots

    snapshots = read_snapshots(args.snapshots)
    _require_database()
    log.info(
        "%d snapshot(s) em %s. Se precisar gerar os embeddings, a primeira vez baixa o modelo %s",
        len(snapshots),
        args.snapshots,
        get_settings().embedding_model,
    )
    clock = perf_counter()
    for name, result in load_snapshots(get_engine(), snapshots):
        if result.loaded:
            replaced = (
                f"; {result.replaced_chunks} trechos antigos substituídos"
                if result.replaced_chunks
                else ""
            )
            log.info(
                "%s (%s): %d artigos em %d trechos carregados%s",
                result.source_id,
                name,
                result.articles,
                result.chunks,
                replaced,
            )
        else:
            log.info(
                "%s (%s): já está na base (%d artigos, %d trechos): nada a fazer",
                result.source_id,
                name,
                result.articles,
                result.chunks,
            )
        if result.review_status != "reviewed":
            log.warning(
                "%s está como %s: o chat só usa a fonte depois de revisada (review_status"
                " reviewed no snapshot; depois rode rag-load de novo)",
                result.source_id,
                result.review_status,
            )
    log.info("pronto em %.0f s", perf_counter() - clock)
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
    dataset = _dataset(args.dataset)
    if args.command == "replay":
        result = batch.run_replay(engine, dataset=dataset)
    else:
        options = {"force": args.force, "allow_in_sample": args.allow_in_sample}
        if args.command == "batch":
            result = batch.run_batch(engine, dates["week"], dataset=dataset, **options)
        else:
            result = batch.run_backfill(
                engine, dates.get("start"), dates.get("end"), dataset=dataset, **options
            )
    for note in result.notes:
        log.info("%s", note)
    if result.processed:
        log.info(
            "pronto: %d semana(s) processada(s) e disponível(is) no app em %.0f s",
            len(result.processed),
            perf_counter() - clock,
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parser().parse_args(argv)
    try:
        if args.command == "load":
            return _load(args)
        if args.command == "labels":
            return _labels(args)
        if args.command == "simulate-analyst":
            return _simulate(args)
        if args.command == "feedback-eval":
            return _feedback_eval(args)
        if args.command == "rag-load":
            return _rag_load(args)
        if args.command == "serve":
            _require_database()
            from worker.jobs import serve

            serve(get_engine())
            return 0
        return _batch(args)
    except WorkerError as exc:
        log.error("%s", exc)
        return 1
    except OperationalError as exc:  # o banco caiu no meio do caminho
        log.error(
            "banco indisponível (%s): suba com  docker compose up -d db  e rode de novo",
            type(exc.orig).__name__,
        )
        return 1
