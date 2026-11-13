"""Analista simulado e ``feedback-eval``: decide pelo gabarito só o que ninguém decidiu, com erro e
"sem evidência" nas taxas pedidas, desfaz sem tocar no trabalho humano, e o experimento grava as
métricas do controle e do tratamento sem registrar versão."""

import json
import logging
import shutil
from datetime import timedelta
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("lightgbm")

from worker_helpers import FIRST_WEEK, LAST_WEEK, rows, scalar  # noqa: E402

from fraudradar.config import get_settings  # noqa: E402
from fraudradar.datasets import resolve_dataset  # noqa: E402
from worker.batch import run_backfill  # noqa: E402
from worker.cli import main  # noqa: E402
from worker.feedback_eval import run_feedback_eval  # noqa: E402
from worker.simulate_analyst import (  # noqa: E402
    JUSTIFICATION,
    SIMULATED_ANALYST,
    simulate_analyst,
    simulated_decisions,
    undo_simulation,
)

OPEN_WEEK = LAST_WEEK  # 24/07/2023: a semana da transação mais recente do dado sintético

# A conta da semana lavou? Pelo lado dela, com o CAIXA do outro lado da espécie (como o modelo).
TRUTH = """
SELECT a.id, bool_or(g.label = 1) AS launders
FROM alerts a
JOIN transactions t
  ON t.occurred_at >= a.week AND t.occurred_at < a.week + 7
 AND ((t.sender = a.account AND t.payment_type <> 'Cash Deposit')
   OR (t.receiver = a.account AND t.payment_type <> 'Cash Withdrawal'))
JOIN ground_truth g ON g.transaction_id = t.id
GROUP BY a.id
"""


@pytest.fixture
def processed(loaded, model_dir, no_rules):
    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():
        shutil.copy(path, official / path.name)
    run_backfill(loaded, model_dir=official, rules_dir=no_rules)
    return loaded


def _decisions(engine) -> list[dict]:
    return rows(
        engine,
        "SELECT d.alert_id, d.decision, d.archive_reason, d.analyst, d.justification, a.status"
        " FROM decisions d JOIN alerts a ON a.id = d.alert_id ORDER BY d.alert_id, d.id",
    )


# --- o sorteio, sem banco -----------------------------------------------------------------------


def test_simulated_decisions_follow_the_rates_and_the_seed():
    launders = np.arange(100_000) % 2 == 0
    chosen = simulated_decisions(launders, np.random.default_rng(1), 0.1, 0.2)

    assert chosen["flipped"].mean() == pytest.approx(0.1, abs=0.005)
    concluded = launders ^ chosen["flipped"].to_numpy()
    assert (chosen["decision"] == np.where(concluded, "report", "archive")).all()
    archived = chosen[chosen["decision"] == "archive"]
    insufficient = archived["archive_reason"] == "insufficient_evidence"
    assert insufficient.mean() == pytest.approx(0.2, abs=0.01)
    # rótulo: comunicar = 1, falso positivo = 0, sem evidência = nenhum
    reported = chosen[chosen["decision"] == "report"]
    assert reported["archive_reason"].isna().all() and (reported["label"] == 1).all()
    assert archived.loc[insufficient, "label"].isna().all()
    assert (archived.loc[~insufficient, "label"] == 0).all()
    assert (archived.loc[~insufficient, "archive_reason"] == "false_positive").all()
    # mesma semente, mesmas decisões; outra semente, outras
    again = simulated_decisions(launders, np.random.default_rng(1), 0.1, 0.2)
    assert again.equals(chosen)
    other = simulated_decisions(launders, np.random.default_rng(2), 0.1, 0.2)
    assert not other["flipped"].equals(chosen["flipped"])


def test_without_error_the_simulated_analyst_is_the_ground_truth():
    launders = np.array([True, False, True, False])
    chosen = simulated_decisions(launders, np.random.default_rng(3), 0.0, 0.0)
    assert chosen["decision"].tolist() == ["report", "archive", "report", "archive"]
    assert chosen["label"].tolist() == [1, 0, 1, 0]
    assert not chosen["flipped"].any()


# --- no banco --------------------------------------------------------------------------------


def test_decides_undecided_alerts_of_closed_weeks_from_the_ground_truth(processed):
    result = simulate_analyst(processed, error_rate=0, insufficient_rate=0)

    closed = scalar(processed, "SELECT count(*) FROM alerts WHERE week < :o", o=OPEN_WEEK)
    assert result.decided == closed > 0
    assert result.weeks[-1] < OPEN_WEEK
    # o período aberto fica intacto
    assert scalar(processed, "SELECT count(*) FROM decisions d JOIN alerts a ON a.id = d.alert_id"
                  " WHERE a.week = :o", o=OPEN_WEEK) == 0  # fmt: skip
    truth = {r["id"]: r["launders"] for r in rows(processed, TRUTH)}
    for d in _decisions(processed):
        expected = "report" if truth[d["alert_id"]] else "archive"
        assert d["decision"] == expected
        assert d["archive_reason"] == (None if expected == "report" else "false_positive")
        assert d["status"] == ("reported" if expected == "report" else "archived")
        assert (d["analyst"], d["justification"]) == (SIMULATED_ANALYST, JUSTIFICATION)
    labels = rows(processed, "SELECT alert_id, label, source, origin FROM analyst_labels")
    assert len(labels) == closed
    assert {r["source"] for r in labels} == {"simulated"}
    assert {r["origin"] for r in labels} == {"model", "exploration"}  # as duas origens
    assert all(r["label"] == int(truth[r["alert_id"]]) for r in labels)
    assert result.reported == sum(r["label"] for r in labels)
    assert scalar(processed, "SELECT count(*) FROM reports") == 0  # nenhum rascunho ao COAF
    [audit] = rows(
        processed, "SELECT actor, details FROM audit_log WHERE action = 'analyst_simulated'"
    )
    assert audit["actor"] == SIMULATED_ANALYST
    assert audit["details"]["decided"] == closed and audit["details"]["seed"] == 108


def test_respects_the_date_range_and_never_touches_a_decided_alert(processed, client):
    human = rows(
        processed,
        "SELECT id FROM alerts WHERE week = :w ORDER BY queue_position LIMIT 1",
        w=FIRST_WEEK + timedelta(weeks=1),
    )[0]["id"]
    response = client.post(
        f"/alerts/{human}/decision",
        json={"decision": "escalate", "justification": "Decisão de uma pessoa antes da simulação."},
    )
    assert response.status_code == 200

    start, end = FIRST_WEEK + timedelta(weeks=1), FIRST_WEEK + timedelta(weeks=2, days=6)
    result = simulate_analyst(processed, start=start, end=end)

    in_range = scalar(
        processed, "SELECT count(*) FROM alerts WHERE week BETWEEN :s AND :e", s=start, e=end
    )
    assert result.decided == in_range - 1
    assert result.weeks == [start, start + timedelta(weeks=1)]
    decisions = _decisions(processed)
    human_rows = [d for d in decisions if d["alert_id"] == human]
    assert [(d["decision"], d["status"]) for d in human_rows] == [("escalate", "escalated")]
    assert scalar(
        processed,
        "SELECT count(*) FROM decisions d JOIN alerts a ON a.id = d.alert_id"
        " WHERE a.week < :s OR a.week > :e",
        s=start,
        e=end,
    ) == 0  # fmt: skip
    assert simulate_analyst(processed, start=start, end=end).decided == 0  # nada mais a decidir


def test_same_seed_same_decisions_and_the_rates_show_up(processed):
    first = simulate_analyst(processed, error_rate=0.5, insufficient_rate=0.5, seed=7)
    before = [(d["alert_id"], d["decision"], d["archive_reason"]) for d in _decisions(processed)]
    assert 0 < first.flipped < first.decided
    assert 0 < first.insufficient_evidence < first.decided - first.reported
    undo_simulation(processed)
    again = simulate_analyst(processed, error_rate=0.5, insufficient_rate=0.5, seed=7)
    after = [(d["alert_id"], d["decision"], d["archive_reason"]) for d in _decisions(processed)]
    assert after == before and again.flipped == first.flipped
    # sem evidência suficiente não deixa rótulo
    labels = scalar(processed, "SELECT count(*) FROM analyst_labels")
    assert labels == again.decided - again.insufficient_evidence


def test_undo_restores_only_alerts_decided_only_by_the_simulation(processed, client):
    simulate_analyst(processed, error_rate=0, insufficient_rate=0)
    later = rows(processed, "SELECT alert_id FROM decisions ORDER BY alert_id LIMIT 1")[0]
    alert_id = later["alert_id"]
    response = client.post(
        f"/alerts/{alert_id}/decision",
        json={
            "decision": "archive",
            "archive_reason": "insufficient_evidence",
            "justification": "Revisão humana depois da simulação.",
        },
    )
    assert response.status_code == 200

    result = undo_simulation(processed)

    decided = scalar(processed, "SELECT count(*) FROM alerts WHERE week < :o", o=OPEN_WEEK)
    assert result.decisions == decided
    assert result.alerts_reset == decided - 1
    remaining = _decisions(processed)
    assert [(d["alert_id"], d["analyst"], d["status"]) for d in remaining] == [
        (alert_id, "Analista local", "archived")
    ]
    assert scalar(processed, "SELECT count(*) FROM analyst_labels") == 0
    assert scalar(
        processed, "SELECT count(*) FROM alerts WHERE status = 'new' AND id <> :a", a=alert_id
    ) == scalar(processed, "SELECT count(*) FROM alerts") - 1  # fmt: skip
    actions = [r["action"] for r in rows(processed, "SELECT action FROM audit_log ORDER BY id")]
    assert actions[-1] == "analyst_simulation_undone"
    assert undo_simulation(processed).decisions == 0  # de novo: nada a desfazer


def test_feedback_eval_writes_both_metric_sets_and_registers_nothing(processed, monkeypatch):
    for module in ("fraudradar.model.feedback", "fraudradar.model.training"):
        monkeypatch.setattr(f"{module}.MIN_FEEDBACK_LABELS", 10)
    simulate_analyst(processed)
    folder = Path(get_settings().model_dir) / "saml-d"
    with processed.connect() as conn:
        dataset = resolve_dataset(conn, "saml-d")

    path, result = run_feedback_eval(processed, dataset, include_simulated=True)

    assert path.parent == folder and path.name.startswith("feedback-eval-")
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved == json.loads(json.dumps(result))
    assert saved["include_simulated"] is True and saved["split"]["train_end"] == "2023-07-02"
    for name in ("control", "treatment"):
        metrics = saved[name]
        assert {"pr_auc", "queue_recall", "queue_precision", "innocents_per_week"} <= set(metrics)
        assert isinstance(metrics["recall_by_typology"], dict)
    assert saved["difference"]["pr_auc"] == pytest.approx(
        saved["treatment"]["pr_auc"] - saved["control"]["pr_auc"]
    )
    assert saved["feedback"]["labels_used"]["by_source"]["simulated"] > 0
    assert not list(folder.glob("lightgbm_v*"))  # nenhuma versão registrada
    assert scalar(processed, "SELECT count(*) FROM audit_log WHERE action = 'model_trained'") == 0
    # só com o retorno dos analistas (nenhum, aqui): recusa em português
    with pytest.raises(Exception, match="há 0"):
        run_feedback_eval(processed, dataset, include_simulated=False)


def test_cli_validates_before_touching_the_database(caplog):
    caplog.set_level(logging.INFO, logger="worker")
    assert main(["simulate-analyst", "--error-rate", "2"]) == 1
    assert "--error-rate precisa estar entre 0 e 1" in caplog.text
    assert main(["simulate-analyst", "--from", "22/05/2023"]) == 1
    assert "use a data no formato AAAA-MM-DD" in caplog.text


def test_cli_runs_and_undoes(processed, caplog):
    caplog.set_level(logging.INFO, logger="worker")
    assert main(["simulate-analyst", "--from", "2023-05-22", "--to", "2023-06-04"]) == 0
    assert "alertas decididos em 2 semana(s) (2023-05-22 a 2023-05-29)" in caplog.text
    assert main(["simulate-analyst", "--undo"]) == 0
    assert "simulação desfeita" in caplog.text
    assert scalar(processed, "SELECT count(*) FROM decisions") == 0
