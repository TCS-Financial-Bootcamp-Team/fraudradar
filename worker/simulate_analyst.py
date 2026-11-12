"""Analista simulado: decide pelo gabarito os alertas sem decisão das semanas fechadas.

Serve à demonstração e à medida honesta do retorno dos analistas (``python -m worker
feedback-eval``): sem ele, o SAML-D não tem decisão nenhuma para retreinar. Ele age como um
analista que erra às vezes:

- conta que lavou na semana (alguma transação dela, pelo lado dela, com ``label = 1`` no
  gabarito) → comunicar (lavagem confirmada);
- as outras → arquivar como falso positivo confirmado;
- com probabilidade ``error_rate`` a conclusão sai trocada (analistas erram);
- com probabilidade ``insufficient_rate`` um arquivamento sai "sem evidência suficiente", que não
  deixa rótulo.

Grava as decisões com o analista ``analista-simulado`` e a justificativa fixa, muda o status dos
alertas, grava os rótulos com ``source = 'simulated'`` e uma linha de auditoria por rodada; não
cria rascunho de comunicação. Nunca toca em alerta que já tem decisão. ``undo_simulation`` desfaz
tudo e volta para ``new`` só os alertas cujas decisões eram todas simuladas.

Junto com ``worker/labels.py`` e ``worker/metrics.py``, é código do worker que lê
``ground_truth``: só para decidir no lugar do analista, nunca para dar nota. O modelo nunca lê o
gabarito, e a API também não.
"""

import json
from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import Connection, Engine, text

from fraudradar.datasets import Dataset, use_dataset
from fraudradar.model.feedback import open_week
from worker.errors import WorkerError

SIMULATED_ANALYST = "analista-simulado"
JUSTIFICATION = "Decisão simulada a partir do gabarito (demonstração)."
DEFAULT_ERROR_RATE = 0.1
DEFAULT_INSUFFICIENT_RATE = 0.2
DEFAULT_SEED = 108


@dataclass
class SimulationResult:
    decided: int = 0
    reported: int = 0
    false_positive: int = 0
    insufficient_evidence: int = 0
    flipped: int = 0  # decisões em que o analista simulado errou de propósito
    without_truth: int = 0  # alertas sem transação rotulada: ficam sem decisão
    weeks: list[date] = field(default_factory=list)


@dataclass
class UndoResult:
    decisions: int = 0
    labels: int = 0
    alerts_reset: int = 0


def simulated_decisions(
    launders: np.ndarray, rng: np.random.Generator, error_rate: float, insufficient_rate: float
) -> pd.DataFrame:
    """A decisão de cada alerta a partir do gabarito da conta na semana (``launders``).

    Sorteia dois números por alerta, sempre na mesma ordem: o primeiro decide se a conclusão
    sai trocada (``error_rate``), o segundo, se um arquivamento sai sem evidência suficiente
    (``insufficient_rate``). Colunas: ``decision``, ``archive_reason``, ``label`` (None quando a
    decisão não deixa rótulo) e ``flipped``.
    """
    draws = rng.random((len(launders), 2))
    flipped = draws[:, 0] < error_rate
    concluded = np.asarray(launders, dtype=bool) ^ flipped
    insufficient = ~concluded & (draws[:, 1] < insufficient_rate)
    label = pd.array(np.where(concluded, 1, 0), dtype="Int8")
    label[insufficient] = pd.NA
    reason = np.where(insufficient, "insufficient_evidence", "false_positive").astype(object)
    reason[concluded] = None
    return pd.DataFrame(
        {
            "decision": np.where(concluded, "report", "archive"),
            "archive_reason": reason,
            "label": label,
            "flipped": flipped,
        }
    )


def _check_rate(name: str, value: float) -> None:
    if not 0 <= value <= 1:
        raise WorkerError(f"{name} precisa estar entre 0 e 1 (recebi {value})")


def _scope(conn: Connection, dataset: Dataset | None) -> None:
    if dataset is not None:
        use_dataset(conn, dataset)


def _undecided_alerts(conn: Connection, before: date, start: date | None, end: date | None):
    """Os alertas sem decisão das semanas fechadas no intervalo, travados até o fim da transação
    (a API trava o alerta do mesmo jeito ao decidir)."""
    rows = conn.execute(
        text(
            "SELECT a.id, a.account, a.week FROM alerts a"
            " WHERE a.week < :before"
            " AND (CAST(:start AS date) IS NULL OR a.week >= :start)"
            " AND (CAST(:end AS date) IS NULL OR a.week <= :end)"
            " AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.alert_id = a.id)"
            " ORDER BY a.id FOR UPDATE OF a"
        ),
        {"before": before, "start": start, "end": end},
    ).all()
    return pd.DataFrame([tuple(r) for r in rows], columns=["id", "account", "week"])


def _launderers(conn: Connection, alert_ids: list[int]) -> dict[int, bool]:
    """Para cada alerta, se a conta lavou na semana: alguma transação dela, pelo lado dela, com
    ``label = 1`` no gabarito. O lado é o do modelo: no depósito e no saque em espécie o outro
    lado é o CAIXA. Alerta sem nenhuma transação rotulada fica de fora."""
    rows = conn.execute(
        text(
            """
            WITH chosen AS (
                SELECT id, account, CAST(week AS timestamp) AS start FROM alerts
                WHERE id = ANY(CAST(:ids AS bigint[]))
            ), sides AS (
                SELECT c.id AS alert_id, t.id AS transaction_id FROM chosen c
                JOIN transactions t ON t.sender = c.account
                 AND t.occurred_at >= c.start AND t.occurred_at < c.start + INTERVAL '7 days'
                 AND t.payment_type <> 'Cash Deposit'
                UNION ALL
                SELECT c.id, t.id FROM chosen c
                JOIN transactions t ON t.receiver = c.account
                 AND t.occurred_at >= c.start AND t.occurred_at < c.start + INTERVAL '7 days'
                 AND t.payment_type <> 'Cash Withdrawal'
            )
            SELECT s.alert_id, bool_or(g.label = 1) AS launders
            FROM sides s JOIN ground_truth g ON g.transaction_id = s.transaction_id
            GROUP BY s.alert_id
            """
        ),
        {"ids": alert_ids},
    ).all()
    return {int(r.alert_id): bool(r.launders) for r in rows}


def simulate_analyst(
    engine: Engine,
    dataset: Dataset | None = None,
    *,
    start: date | None = None,
    end: date | None = None,
    error_rate: float = DEFAULT_ERROR_RATE,
    insufficient_rate: float = DEFAULT_INSUFFICIENT_RATE,
    seed: int = DEFAULT_SEED,
) -> SimulationResult:
    """Decide, numa transação só, os alertas sem decisão das semanas fechadas de ``start`` a
    ``end`` (as segundas dentro do intervalo; sem datas, todas as fechadas)."""
    _check_rate("--error-rate", error_rate)
    _check_rate("--insufficient-rate", insufficient_rate)
    if start is not None and end is not None and start > end:
        raise WorkerError(f"--from {start.isoformat()} vem depois de --to {end.isoformat()}")
    result = SimulationResult()
    slug = dataset.slug if dataset is not None else "saml-d"
    with engine.begin() as conn:
        _scope(conn, dataset)
        before = open_week(conn)
        if before is None:
            return result
        alerts = _undecided_alerts(conn, before, start, end)
        if alerts.empty:
            return result
        truth = _launderers(conn, alerts["id"].tolist())
        result.without_truth = int((~alerts["id"].isin(list(truth))).sum())
        alerts = alerts[alerts["id"].isin(list(truth))].reset_index(drop=True)
        if alerts.empty:
            return result
        launders = alerts["id"].map(truth).to_numpy(dtype=bool)
        chosen = simulated_decisions(
            launders, np.random.default_rng(seed), error_rate, insufficient_rate
        )
        chosen["alert_id"] = alerts["id"].to_numpy()
        records = [
            {
                "alert_id": int(r.alert_id),
                "decision": r.decision,
                "archive_reason": None if pd.isna(r.archive_reason) else r.archive_reason,
                "label": None if pd.isna(r.label) else int(r.label),
            }
            for r in chosen.itertuples(index=False)
        ]
        conn.execute(
            text(
                """
                WITH chosen AS (
                    SELECT * FROM jsonb_to_recordset(CAST(:rows AS jsonb))
                        AS r(alert_id bigint, decision text, archive_reason text, label smallint)
                ), decided AS (
                    INSERT INTO decisions
                        (alert_id, analyst, decision, justification, archive_reason)
                    SELECT alert_id, :analyst, decision, :justification, archive_reason
                    FROM chosen ORDER BY alert_id
                    RETURNING id, alert_id
                ), labeled AS (
                    INSERT INTO analyst_labels
                        (alert_id, decision_id, account, week, label, origin, source)
                    SELECT a.id, d.id, a.account, a.week, c.label, a.origin, 'simulated'
                    FROM decided d
                    JOIN chosen c ON c.alert_id = d.alert_id
                    JOIN alerts a ON a.id = d.alert_id
                    WHERE c.label IS NOT NULL
                    RETURNING alert_id
                )
                UPDATE alerts a
                SET status = CASE c.decision WHEN 'report' THEN 'reported' ELSE 'archived' END,
                    updated_at = now()
                FROM chosen c WHERE a.id = c.alert_id
                """
            ),
            {
                "rows": json.dumps(records),
                "analyst": SIMULATED_ANALYST,
                "justification": JUSTIFICATION,
            },
        )
        result.decided = len(chosen)
        result.reported = int((chosen["decision"] == "report").sum())
        result.insufficient_evidence = int(
            (chosen["archive_reason"] == "insufficient_evidence").sum()
        )
        result.false_positive = result.decided - result.reported - result.insufficient_evidence
        result.flipped = int(chosen["flipped"].sum())
        result.weeks = sorted(pd.to_datetime(alerts["week"]).dt.date.unique())
        conn.execute(
            text(
                "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
                " VALUES (:actor, 'analyst_simulated', 'dataset', :slug, CAST(:details AS jsonb))"
            ),
            {
                "actor": SIMULATED_ANALYST,
                "slug": slug,
                "details": json.dumps(
                    {
                        "decided": result.decided,
                        "reported": result.reported,
                        "false_positive": result.false_positive,
                        "insufficient_evidence": result.insufficient_evidence,
                        "flipped": result.flipped,
                        "without_truth": result.without_truth,
                        "from": None if start is None else start.isoformat(),
                        "to": None if end is None else end.isoformat(),
                        "error_rate": error_rate,
                        "insufficient_rate": insufficient_rate,
                        "seed": seed,
                    }
                ),
            },
        )
    return result


def undo_simulation(engine: Engine, dataset: Dataset | None = None) -> UndoResult:
    """Apaga as decisões e os rótulos do analista simulado e volta para ``new`` só os alertas
    cujas decisões eram todas simuladas. Decisão de uma pessoa depois da simulação fica, com o
    status e o rótulo dela."""
    result = UndoResult()
    slug = dataset.slug if dataset is not None else "saml-d"
    with engine.begin() as conn:
        _scope(conn, dataset)
        touched = list(
            conn.execute(
                text(
                    "SELECT DISTINCT alert_id FROM decisions WHERE analyst = :analyst"
                    " ORDER BY alert_id"
                ),
                {"analyst": SIMULATED_ANALYST},
            ).scalars()
        )
        if not touched:
            return result
        conn.execute(
            text("SELECT id FROM alerts WHERE id = ANY(CAST(:ids AS bigint[])) FOR UPDATE"),
            {"ids": touched},
        )
        only_simulated = list(
            conn.execute(
                text(
                    "SELECT alert_id FROM decisions WHERE alert_id = ANY(CAST(:ids AS bigint[]))"
                    " GROUP BY alert_id HAVING bool_and(analyst = :analyst)"
                ),
                {"ids": touched, "analyst": SIMULATED_ANALYST},
            ).scalars()
        )
        # O rótulo aponta para a decisão que o deixou: some junto com ela (ON DELETE CASCADE).
        result.labels = conn.execute(
            text(
                "SELECT count(*) FROM analyst_labels l JOIN decisions d ON d.id = l.decision_id"
                " WHERE d.analyst = :analyst"
            ),
            {"analyst": SIMULATED_ANALYST},
        ).scalar_one()
        result.decisions = conn.execute(
            text("DELETE FROM decisions WHERE analyst = :analyst"),
            {"analyst": SIMULATED_ANALYST},
        ).rowcount
        result.alerts_reset = conn.execute(
            text(
                "UPDATE alerts SET status = 'new', updated_at = now()"
                " WHERE id = ANY(CAST(:ids AS bigint[]))"
            ),
            {"ids": only_simulated},
        ).rowcount
        conn.execute(
            text(
                "INSERT INTO audit_log (actor, action, entity, entity_id, details)"
                " VALUES (:actor, 'analyst_simulation_undone', 'dataset', :slug,"
                " CAST(:details AS jsonb))"
            ),
            {
                "actor": SIMULATED_ANALYST,
                "slug": slug,
                "details": json.dumps(
                    {
                        "decisions": result.decisions,
                        "labels": result.labels,
                        "alerts_reset": result.alerts_reset,
                    }
                ),
            },
        )
    return result
