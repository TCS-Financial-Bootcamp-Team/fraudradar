"""Lote semanal: score, fila, evidências e métricas, numa transação do banco por semana.

Uma semana vai de segunda 00:00 à segunda seguinte. Para cada pedido (`batch`, `backfill`,
`replay`), o worker:

1. lê do Postgres as transações desde `history_start` da ficha até o fim da última semana pedida
   (as contagens do histórico das variáveis dependem desse início; em outro conjunto, desde a
   primeira transação dele) e calcula as variáveis uma vez só, com `compute_features`;
2. em cada semana: score de cada transação com o booster, fila por conta (`worker.queue`),
   contribuições da transação de maior score de cada conta da fila, regras de `db/rules/`,
   sinais da semana (`worker.summary`) e segmento das contas ativas;
3. grava a semana numa transação: `model_versions`, `transaction_scores`, `accounts`, `alerts` e
   `evidence`; depois as métricas contra o gabarito (`worker.metrics`, o único que lê
   `ground_truth`), `weekly_batches`, `ingestions` e `audit_log`.

No conjunto em que o modelo treinou (`training_dataset` da ficha; sem o campo, o SAML-D), só
processa semanas que começam depois do treino (`train_end`), a não ser com `allow_in_sample`: o
modelo já viu os scores do treino, e a demo pareceria melhor do que é. Em outro conjunto o modelo
nunca viu as transações, mesmo com datas anteriores ao treino, e toda semana é processada.
Semana já processada fica como está; `force` refaz, menos quando há trabalho de analista nela.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from time import perf_counter

import lightgbm as lgb
import numpy as np
import pandas as pd
from sqlalchemy import Connection, Engine

from fraudradar.config import get_settings
from fraudradar.datasets import Dataset, use_dataset
from fraudradar.features.history import (
    CASH_ACCOUNT,
    account_profile,
    compute_features,
    with_cash_account,
)
from fraudradar.model import OFFICIAL_DATASET
from fraudradar.model.naming import dataset_version_name, file_stem, parse_dataset_version
from fraudradar.model.segments import assign_segments
from fraudradar.model.training import load_model
from worker import queue, repository, summary
from worker.errors import WorkerError
from worker.metrics import week_metrics
from worker.rules import RULES_DIR, run_rules
from worker.weeks import (
    check_monday,
    check_out_of_sample,
    first_out_of_sample_week,
    guards_training_period,
    monday,
)

log = logging.getLogger("worker")

CARD_KEYS = (
    "version",
    "features",
    "categories",
    "history_start",
    "train_end",
    "transaction_threshold",
    "queue_size",
    "queue_cut",
    "segments",
    "metrics",
)


@dataclass
class WeekResult:
    week: date
    transactions: int
    active_accounts: int
    alerts: int
    metrics: dict


@dataclass
class RunResult:
    processed: list[WeekResult] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)  # o que não foi feito, e por quê


@dataclass
class _Week:
    """O que a semana vai gravar, calculado antes de abrir a transação."""

    week: date
    tx: pd.DataFrame  # as transações da semana, como gravadas
    scores: np.ndarray  # float64, alinhado com tx
    active_accounts: int
    alerts: list[dict]
    evidence: list[dict]  # sem as regras, que rodam no banco
    accounts: pd.DataFrame
    ingestions: list[int]


# --- ficha e semanas ------------------------------------------------------------------------


def load_card(
    model_dir: Path | None = None, model_version: str | None = None
) -> tuple[lgb.Booster, dict]:
    """O modelo mais novo de MODEL_DIR (ou `model_dir`) e a ficha dele."""
    try:
        if model_version is None:
            booster, card = load_model(model_dir)
        else:
            if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", model_version):
                raise WorkerError("a versão ativa do modelo tem um nome inválido")
            folder = Path(model_dir or get_settings().model_dir)
            card = json.loads((folder / f"{model_version}.json").read_text(encoding="utf-8"))
            booster = lgb.Booster(model_file=str(folder / f"{model_version}.txt"))
    except FileNotFoundError as exc:
        raise WorkerError(f"{exc} (uv run --group ml python -m fraudradar.model train)") from exc
    except lgb.basic.LightGBMError as exc:
        raise WorkerError(f"não consegui ler o modelo: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise WorkerError(
            "a ficha do modelo não está em UTF-8 (foi gravada antes do conserto da ficha): treine"
            " de novo (uv run --group ml python -m fraudradar.model train)"
        ) from exc
    missing = [key for key in CARD_KEYS if key not in card]
    if missing:
        raise WorkerError(
            f"a ficha lightgbm_v{card.get('version')}.json não tem {', '.join(missing)}:"
            " treine de novo (uv run --group ml python -m fraudradar.model train)"
        )
    return booster, card


def _dataset_model(dataset: Dataset | None, model_dir: Path | None) -> tuple[lgb.Booster, dict]:
    """Mantém o modelo oficial atual quando o conjunto não fixa uma versão própria."""
    if dataset is None or dataset.active_model_version is None:
        return load_card(model_dir)
    root = Path(model_dir or get_settings().model_dir)
    parsed = parse_dataset_version(dataset.active_model_version)
    if parsed is None:
        # Nome antigo, sem o prefixo do conjunto: continua lendo da pasta dele.
        booster, card = load_card(root / dataset.slug, dataset.active_model_version)
    else:
        slug, number = parsed
        if slug != dataset.slug:
            raise WorkerError(
                f"a versão ativa '{dataset.active_model_version}' pertence a outro conjunto de"
                " dados"
            )
        booster, card = load_card(root / slug, file_stem(number))
        # Só em memória: o nome gravado em model_versions/alertas não colide com o do oficial.
        card["model_name"] = dataset_version_name(slug, number)
    # Ficha de retreino gravada antes de `training_dataset`: a pasta diz em que conjunto treinou.
    card.setdefault("training_dataset", dataset.slug)
    return booster, card


def _scope(conn: Connection, dataset: Dataset | None) -> None:
    if dataset is not None:
        use_dataset(conn, dataset)


def _guarded(card: dict, dataset: Dataset | None) -> bool:
    """A trava do período de treino vale para este conjunto? (sem `dataset`, o SAML-D)"""
    return guards_training_period(card, dataset.slug if dataset is not None else OFFICIAL_DATASET)


def model_version(card: dict) -> str:
    """``lightgbm_vN`` (oficial) ou ``<slug>/vN`` (retreino do conjunto, ver ``model_name``)."""
    return card.get("model_name") or file_stem(card["version"])


# --- comandos -------------------------------------------------------------------------------


def run_batch(
    engine: Engine,
    week: date,
    *,
    force: bool = False,
    allow_in_sample: bool = False,
    model_dir: Path | None = None,
    rules_dir: Path = RULES_DIR,
    dataset: Dataset | None = None,
) -> RunResult:
    """Uma semana (`week` é a segunda-feira)."""
    check_monday(week, "--week")
    booster, card = _dataset_model(dataset, model_dir)
    if _guarded(card, dataset):
        check_out_of_sample([week], card, allow_in_sample)
    return _run(engine, [week], booster, card, force=force, rules_dir=rules_dir, dataset=dataset)


def run_backfill(
    engine: Engine,
    start: date | None = None,
    end: date | None = None,
    *,
    force: bool = False,
    allow_in_sample: bool = False,
    model_dir: Path | None = None,
    rules_dir: Path = RULES_DIR,
    dataset: Dataset | None = None,
) -> RunResult:
    """Todas as semanas de `start` a `end` (segundas), com as variáveis calculadas uma vez só.

    Padrão: da primeira segunda depois do treino (em outro conjunto, da primeira semana com
    transações) à última semana com transações.
    """
    for day, flag in ((start, "--from"), (end, "--to")):
        if day is not None:
            check_monday(day, flag)
    booster, card = _dataset_model(dataset, model_dir)
    if start is not None and end is not None and start > end:
        raise WorkerError(f"--from {start.isoformat()} vem depois de --to {end.isoformat()}")
    guarded = _guarded(card, dataset)
    if start is None and guarded:
        start = first_out_of_sample_week(card)
    if start is None or end is None:
        with engine.connect() as conn:
            _scope(conn, dataset)
            first = repository.first_transaction_at(conn)
            last = repository.last_transaction_at(conn)
        if first is None or last is None:
            return RunResult(
                notes=["nada a processar: o banco não tem transações (rode  python -m worker load)"]
            )
        start = start or monday(first.date())
        end = end or monday(last.date())
    if start > end:
        return RunResult(
            notes=[f"nada a processar: não há semana com transações de {start} em diante"]
        )
    weeks = [start + timedelta(weeks=i) for i in range((end - start).days // 7 + 1)]
    if guarded:
        check_out_of_sample(weeks, card, allow_in_sample)
    return _run(engine, weeks, booster, card, force=force, rules_dir=rules_dir, dataset=dataset)


def run_replay(
    engine: Engine,
    *,
    model_dir: Path | None = None,
    rules_dir: Path = RULES_DIR,
    dataset: Dataset | None = None,
) -> RunResult:
    """Compatibilidade: processa a próxima semana depois da última já processada."""
    booster, card = _dataset_model(dataset, model_dir)
    first = first_out_of_sample_week(card) if _guarded(card, dataset) else None
    with engine.connect() as conn:
        _scope(conn, dataset)
        latest = repository.latest_processed_week(conn)
        candidates = [] if first is None else [first]
        if latest is not None:
            candidates.append(latest + timedelta(days=7))
        since = max(candidates, default=None)
        next_at = repository.first_transaction_at(
            conn, None if since is None else datetime.combine(since, time.min)
        )
    if next_at is None:
        where = "" if since is None else f" de {since.isoformat()} em diante"
        return RunResult(notes=[f"nada a processar: nenhuma semana com transações{where}"])
    return _run(
        engine,
        [monday(next_at.date())],
        booster,
        card,
        force=False,
        rules_dir=rules_dir,
        dataset=dataset,
    )


def run_continuous(
    engine: Engine,
    *,
    model_dir: Path | None = None,
    rules_dir: Path = RULES_DIR,
    dataset: Dataset | None = None,
) -> RunResult:
    """Processa períodos ainda sem lote e recalcula somente o período aberto.

    O período aberto é a semana da transação mais recente. Uma semana anterior pode ser
    processada pela primeira vez, mas nunca é reescrita. Quando a quantidade de transações
    do período aberto não mudou desde o lote anterior, a rodada termina sem carregar o
    histórico e sem executar o modelo.
    """
    booster, card = _dataset_model(dataset, model_dir)
    with engine.connect() as conn:
        _scope(conn, dataset)
        last = repository.last_transaction_at(conn)
        if last is None:
            return RunResult(notes=["nada novo: o conjunto não tem transações"])
        open_week = monday(last.date())
        if _guarded(card, dataset):
            first = first_out_of_sample_week(card)
            if open_week < first:
                return RunResult(
                    notes=["nada novo: não há período posterior ao treino do modelo para processar"]
                )
        else:
            # O modelo nunca viu este conjunto: vale desde a primeira semana dele.
            first = monday(repository.first_transaction_at(conn).date())
        _, end = repository.week_window(open_week)
        weeks = sorted(
            repository.weeks_with_transactions(conn, datetime.combine(first, time.min), end)
        )
        done = repository.processed_weeks(conn, weeks)
        todo = [week for week in weeks if week not in done]
        current_count = repository.transaction_count(conn, open_week)
        previous_count = repository.processed_transaction_count(conn, open_week)
        if open_week in done and previous_count != current_count:
            todo.append(open_week)
    if not todo:
        return RunResult(notes=["nada novo: o período aberto não recebeu transações"])
    result = RunResult()
    _process(
        engine,
        sorted(set(todo)),
        booster,
        card,
        force=False,
        rules_dir=rules_dir,
        result=result,
        dataset=dataset,
        recompute_open={open_week} if open_week in done else set(),
    )
    return result


# --- planejamento e processamento ---------------------------------------------------------------


def _run(
    engine, weeks, booster, card, *, force: bool, rules_dir: Path, dataset: Dataset | None
) -> RunResult:
    """Separa o que fazer do que pular e recusa logo o --force sobre trabalho de analista,
    antes de ler 9 milhões de transações."""
    result = RunResult()
    first_start, _ = repository.week_window(min(weeks))
    _, last_end = repository.week_window(max(weeks))
    with engine.connect() as conn:
        _scope(conn, dataset)
        with_transactions = repository.weeks_with_transactions(conn, first_start, last_end)
        done = repository.processed_weeks(conn, weeks)
        blocked = {}
        for week in weeks:
            if week in with_transactions and (force or week not in done):
                reason = repository.protection(conn, week)
                if reason:
                    blocked[week] = reason
    if blocked:
        listed = "; ".join(f"{w.isoformat()}: {reason}" for w, reason in blocked.items())
        raise WorkerError(
            f"reprocessamento recusado ({listed}). O trabalho dos analistas nunca é apagado."
        )
    todo = []
    for week in weeks:
        if week not in with_transactions:
            result.notes.append(f"semana {week.isoformat()}: sem transações, nada a processar")
        elif week in done and not force:
            result.notes.append(
                f"semana {week.isoformat()}: já processada, nada a fazer"
                " (use --force para reprocessar)"
            )
        else:
            todo.append(week)
    if todo:
        _process(
            engine,
            todo,
            booster,
            card,
            force=force,
            rules_dir=rules_dir,
            result=result,
            dataset=dataset,
            recompute_open=set(),
        )
    return result


def _history_start(conn: Connection, card: dict, dataset: Dataset | None) -> datetime:
    """Onde começa o histórico das variáveis.

    No conjunto do treino, em `history_start` da ficha: as contagens do histórico precisam do
    mesmo início do treino. Em outro conjunto, na primeira transação dele, que pode vir antes do
    início do treino (outra época).
    """
    start = datetime.combine(date.fromisoformat(card["history_start"]), time.min)
    if _guarded(card, dataset):
        return start
    first = repository.first_transaction_at(conn)
    return start if first is None else datetime.combine(first.date(), time.min)


def _process(
    engine,
    weeks,
    booster,
    card,
    *,
    force: bool,
    rules_dir: Path,
    result: RunResult,
    dataset: Dataset | None,
    recompute_open: set[date],
):
    clock = perf_counter()
    _, end = repository.week_window(max(weeks))
    with engine.connect() as conn:
        _scope(conn, dataset)
        history_start = _history_start(conn, card, dataset)
        tx = repository.read_transactions(conn, history_start, end)
    log.info(
        "%s transações lidas, de %s a %s (%.0f s)",
        f"{len(tx):,}".replace(",", "."),
        history_start.date().isoformat(),
        (end - timedelta(days=1)).date().isoformat(),
        perf_counter() - clock,
    )
    # A mesma ordem de compute_features (tempo e id): as linhas das variáveis batem com as de tx.
    tx = tx.sort_values(["occurred_at", "id"], kind="stable", ignore_index=True)
    clock = perf_counter()
    # Sem ingestion_id, que compute_features copiaria sem usar (o pico de memória é dela).
    features = compute_features(tx.drop(columns="ingestion_id"))
    if not np.array_equal(features["id"].to_numpy(), tx["id"].to_numpy()):
        raise RuntimeError("compute_features devolveu as transações em outra ordem")
    x, unknown = queue.model_input(features, card)
    del features
    for column, count in unknown.items():
        if count:
            log.warning(
                "%d transações com %s fora das categorias do modelo: o valor vira nulo",
                count,
                column,
            )
    log.info("variáveis calculadas (%.0f s)", perf_counter() - clock)
    times = tx["occurred_at"].to_numpy()
    version = model_version(card)
    for week in weeks:
        clock = perf_counter()
        begin, stop = np.searchsorted(times, np.array(repository.week_window(week), times.dtype))
        prepared = _prepare_week(week, tx, x, begin, stop, booster, card)
        with engine.begin() as conn:
            _scope(conn, dataset)
            outcome = _write_week(
                conn,
                prepared,
                card,
                version,
                force=force,
                preserve_decided=week in recompute_open,
                rules_dir=rules_dir,
            )
        if isinstance(outcome, str):
            result.notes.append(outcome)
            continue
        result.processed.append(outcome)
        log.info(
            "semana %s: %s transações, %s contas ativas, %d alertas; %s (%.0f s)",
            week.isoformat(),
            f"{outcome.transactions:,}".replace(",", "."),
            f"{outcome.active_accounts:,}".replace(",", "."),
            outcome.alerts,
            _describe(outcome.metrics),
            perf_counter() - clock,
        )


def _describe(metrics: dict) -> str:
    def pct(value):
        return "-" if value is None else f"{value:.1%}".replace(".", ",")

    return f"recall {pct(metrics['recall'])}, precisão {pct(metrics['precision'])}"


def _prepare_week(week, tx, x, begin, stop, booster, card) -> _Week:
    """Tudo o que não depende do banco: score, fila, contribuições, sinais e segmentos."""
    week_tx = tx.iloc[begin:stop].reset_index(drop=True)
    week_x = x.iloc[begin:stop]
    scores = booster.predict(week_x)
    cash = with_cash_account(week_tx[["sender", "receiver", "payment_type"]])
    best = queue.account_scores(cash["sender"].to_numpy(), cash["receiver"].to_numpy(), scores)
    chosen = queue.select_queue(best, card["queue_cut"], card["queue_size"])
    contributions = queue.contributions(booster, week_x.iloc[chosen["row"].to_numpy()])
    stats = summary.account_summary(week_tx)
    countries = summary.countries(week_tx, chosen["account"])
    alerts, evidence = [], []
    for item, contribution in zip(chosen.itertuples(index=False), contributions, strict=True):
        account = int(item.account)
        row = stats.loc[account]
        alerts.append(
            {
                "account": account,
                # REAL no banco: o float32, que volta igual (a decisão da fila é em float64)
                "score": float(np.float32(item.score)),
                "queue_position": int(item.queue_position),
                "countries": countries[account],
                "total_amount": int(row["total_cents"]) / 100,
                "transaction_count": int(row["transaction_count"]),
            }
        )
        evidence.append(
            {
                "account": account,
                "contributions": contribution,
                "weekly_signals": summary.weekly_signals(row),
            }
        )
    return _Week(
        week=week,
        tx=week_tx,
        scores=scores,
        active_accounts=len(best),
        alerts=alerts,
        evidence=evidence,
        accounts=_accounts(week_tx, tx, best.index, week, card),
        ingestions=sorted(int(i) for i in week_tx["ingestion_id"].dropna().unique()),
    )


def _accounts(week_tx, tx, active, week, card) -> pd.DataFrame:
    """Contas como gravadas que aparecem na semana, com a primeira e a última transação dela;
    e o segmento das contas ativas, pelo perfil das 12 semanas antes da segunda
    (`account_profile`). Conta sem transação nessas 12 semanas fica com o segmento que tinha."""
    seen = pd.concat(
        [
            week_tx[["sender", "occurred_at"]].rename(columns={"sender": "account"}),
            week_tx[["receiver", "occurred_at"]].rename(columns={"receiver": "account"}),
        ],
        ignore_index=True,
    )
    seen = seen[seen["account"] != CASH_ACCOUNT]
    seen = seen.groupby("account")["occurred_at"].agg(first_seen_at="min", last_seen_at="max")
    profiles = account_profile(tx, until=pd.Timestamp(week))
    profiles = profiles[profiles.index.isin(active)]
    segment = pd.Series(dtype="Int64")
    if len(profiles):
        segment = assign_segments(profiles, card["segments"]).astype("Int64")
    seen["segment"] = segment.reindex(seen.index).astype("Int64")
    return seen.rename_axis("account").reset_index()


def _write_week(
    conn: Connection,
    w: _Week,
    card: dict,
    version: str,
    *,
    force: bool,
    preserve_decided: bool,
    rules_dir: Path,
) -> WeekResult | str:
    """Grava a semana. Volta uma nota (str) se outra execução gravou a semana antes."""
    repository.lock_worker(conn)
    if not force and not preserve_decided and repository.processed_weeks(conn, [w.week]):
        return f"semana {w.week.isoformat()}: outra execução já processou, nada a fazer"
    if preserve_decided:
        latest = repository.last_transaction_at(conn)
        if latest is None or monday(latest.date()) != w.week:
            return f"semana {w.week.isoformat()}: o período fechou durante o processamento"
    else:
        reason = repository.protection(conn, w.week, lock=True)
        if reason:
            raise WorkerError(
                f"reprocessamento recusado ({w.week.isoformat()}: {reason})."
                " O trabalho dos analistas nunca é apagado."
            )
    ids = w.tx["id"].to_numpy()
    repository.upsert_model_version(conn, version, card)
    decided_accounts = (
        repository.clear_open_week(conn, w.week, version, ids) if preserve_decided else set()
    )
    if not preserve_decided:
        repository.clear_week(conn, w.week, version, ids)
    repository.copy_scores(conn, ids, version, w.scores)
    repository.upsert_accounts(conn, w.accounts)
    fired = run_rules(conn, w.week, rules_dir)
    alerts = [row for row in w.alerts if row["account"] not in decided_accounts]
    repository.insert_alerts(conn, w.week, version, alerts)
    evidence = [
        {**e, "rules": fired.get(e["account"], [])}
        for e in w.evidence
        if e["account"] not in decided_accounts
    ]
    repository.insert_evidence(conn, w.week, evidence)
    # Só agora, com a fila gravada, o gabarito é lido.
    metrics = week_metrics(conn, w.week, w.tx)
    metrics["transaction_count"] = len(w.tx)
    repository.insert_weekly_batch(conn, w.week, version, w.active_accounts, metrics)
    repository.update_ingestions(conn, w.ingestions)
    repository.audit_batch(
        conn,
        w.week,
        {
            "alerts": len(w.alerts),
            "model_version": version,
            "active_accounts": w.active_accounts,
            "forced": force,
            "preserved_decided_alerts": len(decided_accounts),
        },
    )
    alert_count = repository.count_alerts(conn, w.week)
    return WeekResult(
        week=w.week,
        transactions=len(w.tx),
        active_accounts=w.active_accounts,
        alerts=alert_count,
        metrics=metrics,
    )
