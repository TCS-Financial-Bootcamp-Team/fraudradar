"""Regras de cenário: cada `db/rules/NNN_nome.sql` roda com `:week` e entra em
`evidence.rules` das contas da fila."""

import pytest

pytest.importorskip("lightgbm")

from worker_helpers import FIRST_WEEK, rows, scalar, week_bounds  # noqa: E402

from worker.batch import run_batch  # noqa: E402
from worker.errors import WorkerError  # noqa: E402
from worker.rules import RULES_DIR, rule_files  # noqa: E402

BIG_SENDER = """-- Regra de teste: quem enviou na semana, com o maior valor enviado.
SELECT sender AS account,
       'Enviou na semana' AS rule,
       jsonb_build_object('max_amount', max(amount)) AS detail
FROM transactions
WHERE occurred_at >= CAST(:week AS date) AND occurred_at < CAST(:week AS date) + 7
GROUP BY sender
"""

CHEQUE = """SELECT receiver AS account, 'Recebeu cheque' AS rule, NULL::jsonb AS detail
FROM transactions
WHERE payment_type = 'Cheque'
  AND occurred_at >= CAST(:week AS date) AND occurred_at < CAST(:week AS date) + 7
GROUP BY receiver
"""


def _rules(folder, **files):
    folder.mkdir(exist_ok=True)
    for name, sql in files.items():
        (folder / name).write_text(sql, encoding="utf-8")
    return folder


def test_rules_go_to_the_evidence_of_the_accounts_in_the_queue(loaded, model_dir, tmp_path):
    folder = _rules(
        tmp_path / "rules", **{"007_big_sender.sql": BIG_SENDER, "012_cheque.sql": CHEQUE}
    )
    run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=folder)
    bounds = week_bounds(FIRST_WEEK)
    alerts = rows(
        loaded,
        "SELECT a.account, e.rules FROM alerts a JOIN evidence e ON e.alert_id = a.id",
    )
    assert alerts
    for alert in alerts:
        account = alert["account"]
        biggest = scalar(
            loaded,
            "SELECT max(amount) FROM transactions WHERE sender = :a"
            " AND occurred_at >= :start AND occurred_at < :end",
            a=account,
            **bounds,
        )
        cheques = scalar(
            loaded,
            "SELECT count(*) FROM transactions WHERE receiver = :a AND payment_type = 'Cheque'"
            " AND occurred_at >= :start AND occurred_at < :end",
            a=account,
            **bounds,
        )
        expected = []
        if biggest is not None:
            expected.append(
                {
                    "code": "R-007",
                    "description": "Enviou na semana",
                    "detail": {"max_amount": float(biggest)},
                }
            )
        if cheques:
            expected.append({"code": "R-012", "description": "Recebeu cheque", "detail": None})
        assert alert["rules"] == expected, account
    # pelo menos uma conta com regra e uma sem cada regra: os dois lados foram conferidos
    codes = [{r["code"] for r in a["rules"]} for a in alerts]
    assert any("R-012" in c for c in codes) and any("R-012" not in c for c in codes)


def test_rules_reach_the_alert_detail_in_the_api(client, loaded, model_dir, tmp_path):
    folder = _rules(tmp_path / "rules", **{"007_big_sender.sql": BIG_SENDER})
    run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=folder)
    alert_id = scalar(
        loaded,
        "SELECT a.id FROM alerts a JOIN evidence e ON e.alert_id = a.id"
        " WHERE jsonb_array_length(e.rules) > 0 ORDER BY a.queue_position LIMIT 1",
    )
    detail = client.get(f"/alerts/{alert_id}").json()
    assert detail["rules"] == [{"code": "R-007", "description": "Enviou na semana"}]


def test_file_out_of_the_name_pattern_is_an_error(loaded, model_dir, tmp_path):
    folder = _rules(tmp_path / "rules", **{"big_sender.sql": BIG_SENDER})
    with pytest.raises(WorkerError, match="NNN_nome.sql: big_sender.sql"):
        run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=folder)
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches") == 0


def test_failing_rule_rolls_the_week_back(loaded, model_dir, tmp_path):
    folder = _rules(tmp_path / "rules", **{"001_broken.sql": "SELECT nope FROM nowhere"})
    with pytest.raises(WorkerError, match="001_broken.sql falhou"):
        run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=folder)
    for table in ("weekly_batches", "alerts", "transaction_scores", "audit_log"):
        assert scalar(loaded, f"SELECT count(*) FROM {table}") == 0, table


def test_rule_without_the_three_columns_is_an_error(loaded, model_dir, tmp_path):
    folder = _rules(tmp_path / "rules", **{"002_short.sql": "SELECT 1 AS account"})
    with pytest.raises(WorkerError, match="faltou detail, rule"):
        run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=folder)


def test_the_real_rules_folder_follows_the_pattern():
    """As regras da frente 1 em db/rules/ seguem NNN_nome.sql (hoje a pasta está vazia)."""
    assert all(code.startswith("R-") for code, _ in rule_files(RULES_DIR))
