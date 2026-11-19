"""Regras de cenário: cada `db/rules/NNN_nome.sql` roda com `:week` e entra em
`evidence.rules` das contas da fila."""

from datetime import datetime, timedelta

import pytest

pytest.importorskip("lightgbm")

from worker_helpers import FIRST_WEEK, rows, scalar, week_bounds  # noqa: E402

from worker.batch import run_batch  # noqa: E402
from worker.errors import WorkerError  # noqa: E402
from worker.rules import RULES_DIR, rule_files, run_rules  # noqa: E402

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
    """As regras oficiais em db/rules/ seguem NNN_nome.sql e formam códigos R-001..R-005."""
    files = rule_files(RULES_DIR)
    assert [code for code, _ in files] == ["R-001", "R-002", "R-003", "R-004", "R-005"]


def _run_single_real_rule(db, code: str, week=FIRST_WEEK) -> dict[int, dict]:
    """Executa uma regra oficial isolada no banco de teste, indexada por conta."""
    matches = [path for rule_code, path in rule_files(RULES_DIR) if rule_code == code]
    assert len(matches) == 1
    with db.connect() as conn:
        from sqlalchemy import text

        result = conn.execute(text(matches[0].read_text(encoding="utf-8")), {"week": week})
        assert {"account", "rule", "detail"}.issubset(set(result.keys()))
        return {int(row["account"]): dict(row) for row in result.mappings()}


def test_real_rules_parse_and_run_on_seeded_week(loaded):
    """Todas as regras oficiais analisam e executam sem erro em uma semana carregada."""
    with loaded.connect() as conn:
        fired = run_rules(conn, FIRST_WEEK, RULES_DIR)
    assert isinstance(fired, dict)
    for entries in fired.values():
        for entry in entries:
            assert entry["code"].startswith("R-")
            assert isinstance(entry["description"], str) and entry["description"]
            assert isinstance(entry["detail"], dict)


def test_rule_001_cash_structuring(db, seed):
    """R-001 dispara para 3+ depósitos em espécie em [1.000, 6.000) totalizando >= 5.000."""
    ts = datetime.combine(FIRST_WEEK, datetime.min.time()) + timedelta(hours=10)
    # Deve disparar: 3 depósitos de 2.000 GBP (= 6.000)
    for i in range(3):
        seed.transaction(
            1000 + i, 2001, ts + timedelta(hours=i), 2000.0, payment_type="Cash Deposit"
        )
    # Não deve disparar: apenas 2 depósitos (= 4.000)
    for i in range(2):
        seed.transaction(
            1100 + i, 2002, ts + timedelta(hours=i), 2000.0, payment_type="Cash Deposit"
        )
    # Não deve disparar: depósitos >= 6.000 GBP não são fracionamento abaixo do limite
    for i in range(3):
        seed.transaction(
            1200 + i, 2003, ts + timedelta(hours=i), 6500.0, payment_type="Cash Deposit"
        )

    hits = _run_single_real_rule(db, "R-001")
    assert 2001 in hits
    assert hits[2001]["detail"]["deposit_count"] == 3
    assert 2002 not in hits
    assert 2003 not in hits


def test_rule_002_high_counterparty_fan_activity(db, seed):
    """R-002 dispara para >= 15 contrapartes distintas na semana (fan-out ou fan-in)."""
    ts = datetime.combine(FIRST_WEEK, datetime.min.time()) + timedelta(hours=9)
    # Deve disparar: 15 destinatários distintos via ACH
    for i in range(15):
        seed.transaction(3001, 4000 + i, ts + timedelta(minutes=i), 500.0, payment_type="ACH")
    # Não deve disparar: 15 envios para apenas 5 destinatários distintos
    for i in range(15):
        seed.transaction(3002, 4100 + (i % 5), ts + timedelta(minutes=i), 500.0, payment_type="ACH")
    # Não deve disparar para o remetente sintético de Cash Deposit
    for i in range(16):
        seed.transaction(
            3003, 4200 + i, ts + timedelta(minutes=i), 500.0, payment_type="Cash Deposit"
        )

    hits = _run_single_real_rule(db, "R-002")
    assert 3001 in hits
    assert hits[3001]["detail"]["distinct_receivers"] == 15
    assert 3002 not in hits
    assert 3003 not in hits


def test_rule_003_high_risk_jurisdiction(db, seed):
    """R-003 dispara em operação internacional >= 20.000 GBP com país de alto risco."""
    ts = datetime.combine(FIRST_WEEK, datetime.min.time()) + timedelta(hours=11)
    # Deve disparar para remetente e destinatário
    seed.transaction(
        5001,
        5002,
        ts,
        25000.0,
        sender_country="UK",
        receiver_country="Nigeria",
        payment_type="Cross-border",
    )
    # Não deve disparar: doméstica dentro do país
    seed.transaction(
        5003,
        5004,
        ts,
        25000.0,
        sender_country="Nigeria",
        receiver_country="Nigeria",
        payment_type="ACH",
    )
    # Não deve disparar: valor abaixo de 20.000 GBP
    seed.transaction(
        5005,
        5006,
        ts,
        15000.0,
        sender_country="UK",
        receiver_country="Nigeria",
        payment_type="Cross-border",
    )

    hits = _run_single_real_rule(db, "R-003")
    assert 5001 in hits and 5002 in hits
    assert hits[5001]["detail"]["countries"] == ["Nigeria"]
    assert 5003 not in hits and 5004 not in hits
    assert 5005 not in hits and 5006 not in hits


def test_rule_004_abrupt_volume_spike(db, seed):
    """R-004 dispara quando o volume semanal salta >= 15x sobre a média das 4 semanas prévias."""
    week_ts = datetime.combine(FIRST_WEEK, datetime.min.time()) + timedelta(hours=12)
    for w in range(1, 5):
        prior_ts = week_ts - timedelta(weeks=w)
        # Conta 6001: média histórica semanal de 1.500 GBP
        seed.transaction(6001, 6100, prior_ts, 1500.0, payment_type="ACH")
        # Conta 6002: média histórica semanal de 10.000 GBP
        seed.transaction(6002, 6200, prior_ts, 10000.0, payment_type="ACH")

    # Conta 6001: 2 envios totalizando 60.000 GBP (40x a média) -> dispara
    seed.transaction(6001, 6101, week_ts, 30000.0, payment_type="ACH")
    seed.transaction(6001, 6102, week_ts + timedelta(hours=1), 30000.0, payment_type="ACH")
    # Conta 6002: 2 envios totalizando 60.000 GBP (6x a média < 15x) -> não dispara
    seed.transaction(6002, 6201, week_ts, 30000.0, payment_type="ACH")
    seed.transaction(6002, 6202, week_ts + timedelta(hours=1), 30000.0, payment_type="ACH")

    hits = _run_single_real_rule(db, "R-004")
    assert 6001 in hits
    assert hits[6001]["detail"]["spike_ratio"] == 40.0
    assert 6002 not in hits


def test_rule_005_cash_heavy_activity(db, seed):
    """R-005 dispara para >= 3 transações, >= 75% em espécie e >= 4.000 GBP em espécie."""
    ts = datetime.combine(FIRST_WEEK, datetime.min.time()) + timedelta(hours=14)
    # Conta 7001: 3 saques em espécie (5.000 GBP) e 1 ACH (75% espécie) -> dispara
    for i in range(3):
        seed.transaction(
            7001, 7900 + i, ts + timedelta(hours=i), 1800.0, payment_type="Cash Withdrawal"
        )
    seed.transaction(7001, 7910, ts + timedelta(hours=4), 500.0, payment_type="ACH")

    # Conta 7002: 2 saques em espécie e 2 ACH (50% espécie < 75%) -> não dispara
    for i in range(2):
        seed.transaction(
            7002, 7920 + i, ts + timedelta(hours=i), 2500.0, payment_type="Cash Withdrawal"
        )
        seed.transaction(7002, 7930 + i, ts + timedelta(hours=2 + i), 500.0, payment_type="ACH")

    hits = _run_single_real_rule(db, "R-005")
    assert 7001 in hits
    assert hits[7001]["detail"]["cash_transactions"] == 3
    assert 7002 not in hits
