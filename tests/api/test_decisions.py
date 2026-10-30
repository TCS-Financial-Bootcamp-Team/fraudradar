"""Decisões transacionais do analista contra Postgres."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import text

from api.dependencies import LOCAL_USER, User, get_current_user
from api.repositories import decisions

JUSTIFICATION = "Movimentação incompatível com o perfil observado."


@pytest.fixture
def alert_id(seed):
    return seed.alert(123456789, date(2023, 1, 2), countries=("UK", "BR"))


def test_decision_on_nonexistent_alert(client, seed):
    resp = client.post(
        "/alerts/999/decision", json={"decision": "report", "justification": JUSTIFICATION}
    )
    assert resp.status_code == 404
    for table in ("decisions", "reports", "audit_log"):
        assert seed.count(table) == 0


@pytest.mark.parametrize(
    ("decision", "db_status", "response_status"),
    [
        ("archive", "archived", "archived"),
        ("escalate", "escalated", "escalated"),
        ("report", "reported", "reported"),
    ],
)
def test_decision_status_author_audit_and_without_assessment(
    client, seed, db, alert_id, decision, db_status, response_status
):
    with db.begin() as conn:
        conn.execute(
            text("UPDATE alerts SET updated_at = '2020-01-01' WHERE id = :id"), {"id": alert_id}
        )
    before = seed.row("SELECT updated_at FROM alerts WHERE id = :id", id=alert_id)
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": decision, "justification": f"  {JUSTIFICATION}\n"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "id": str(alert_id),
        "account": "123456789",
        "week": "2023-01-02",
        "country": "UK",
        "typology": "Fan-out",
        "score": 90.0,
        "amount": 1000.0,
        "transaction_count": 3,
        "status": response_status,
    }
    current = seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id)
    assert current["status"] == db_status
    assert current["updated_at"] > before["updated_at"]
    stored = seed.row("SELECT * FROM decisions WHERE alert_id = :id", id=alert_id)
    assert stored["decision"] == decision
    assert stored["justification"] == JUSTIFICATION
    assert stored["assessment_id"] is None
    assert stored["analyst"] == LOCAL_USER.name
    assert seed.count("decisions") == 1
    assert seed.count("audit_log") == 1
    audit = seed.row("SELECT * FROM audit_log")
    assert audit["action"] == "decision"
    assert audit["actor"] == LOCAL_USER.name
    assert audit["entity"] == "alert"
    assert audit["entity_id"] == str(alert_id)
    assert audit["details"] == {
        "decision": decision,
        "decision_id": stored["id"],
        "user_id": LOCAL_USER.id,
    }
    assert seed.count("reports") == (1 if decision == "report" else 0)


@pytest.mark.parametrize("justification", ["   curta   ", " " * 15, "a" * 4001])
def test_decision_invalid_justification_after_trim(client, seed, alert_id, justification):
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": "archive", "justification": justification},
    )
    assert resp.status_code == 422
    assert seed.count("decisions") == seed.count("audit_log") == 0


def test_decision_outside_contract(client, seed, alert_id):
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": "approve", "justification": JUSTIFICATION},
    )
    assert resp.status_code == 422
    assert seed.count("decisions") == seed.count("audit_log") == 0


@pytest.mark.parametrize("tie", [False, True], ids=["timestamp", "id_tiebreak"])
def test_decision_uses_latest_assessment_for_alert(client, seed, alert_id, tie):
    recent = datetime(2025, 1, 1, tzinfo=UTC)
    older = datetime(2024, 1, 1, tzinfo=UTC)
    if tie:
        seed.assessment(alert_id, "Parecer anterior empatado.", created_at=recent)
    expected_id = seed.assessment(alert_id, "Parecer mais recente escolhido.", created_at=recent)
    if not tie:
        seed.assessment(alert_id, "Parecer antigo com id maior.", created_at=older)
    other_alert = seed.alert(999, date(2023, 1, 2))
    seed.assessment(other_alert, "Parecer de outra conta.")
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": "report", "justification": JUSTIFICATION},
    )
    assert resp.status_code == 200
    stored = seed.row("SELECT * FROM decisions WHERE alert_id = :id", id=alert_id)
    assert stored["assessment_id"] == expected_id
    report = seed.row("SELECT * FROM reports WHERE alert_id = :id", id=alert_id)
    assert "Parecer mais recente escolhido." in report["draft"]
    assert "Parecer anterior" not in report["draft"]
    assert "Parecer antigo" not in report["draft"]
    assert "outra conta" not in report["draft"]


def test_decision_uses_authenticated_user(client, seed, alert_id):
    user = User(id="analyst-42", name="Joana Revisora")
    client.app.dependency_overrides[get_current_user] = lambda: user
    try:
        resp = client.post(
            f"/alerts/{alert_id}/decision",
            json={
                "decision": "archive",
                "justification": JUSTIFICATION,
                "analyst": "Nome falsificado",
            },
        )
    finally:
        client.app.dependency_overrides.pop(get_current_user)
    assert resp.status_code == 200
    assert seed.row("SELECT analyst FROM decisions")["analyst"] == user.name
    audit = seed.row("SELECT * FROM audit_log")
    assert audit["actor"] == user.name
    assert audit["details"]["user_id"] == user.id


def test_report_reuses_draft_and_rebuilds_content(client, seed, db, alert_id):
    req = {"decision": "report", "justification": JUSTIFICATION}
    assert client.post(f"/alerts/{alert_id}/decision", json=req).status_code == 200
    with db.begin() as conn:
        conn.execute(text("UPDATE reports SET created_at = created_at - interval '1 day'"))
    before = seed.row("SELECT * FROM reports")
    new_justification = "Novos indícios: retirada em espécie no exterior logo após o depósito."
    req = {"decision": "report", "justification": new_justification}
    assert client.post(f"/alerts/{alert_id}/decision", json=req).status_code == 200
    after = seed.row("SELECT * FROM reports")
    assert seed.count("reports") == 1
    assert after["id"] == before["id"]
    # O rascunho cita a justificativa vigente, não a da primeira decisão.
    assert new_justification in after["draft"] and JUSTIFICATION not in after["draft"]
    assert after["created_at"] > before["created_at"]
    assert after["decision_id"] != before["decision_id"]
    latest_decision = seed.row("SELECT id FROM decisions ORDER BY id DESC LIMIT 1")
    assert after["decision_id"] == latest_decision["id"]
    assert seed.count("decisions") == seed.count("audit_log") == 2


@pytest.mark.parametrize("decision", ["archive", "escalate", "report"])
def test_decision_after_approval_does_not_write(client, seed, alert_id, decision):
    prior = seed.decision(alert_id)
    seed.report(alert_id, prior, approved_by="Revisora")
    # Mesmo com um rascunho mais novo, a aprovação anterior fecha o alerta.
    seed.report(alert_id, prior)
    before = seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id)
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": decision, "justification": JUSTIFICATION},
    )
    assert resp.status_code == 409
    assert seed.count("decisions") == 1
    assert seed.count("audit_log") == 0
    assert seed.count("reports") == 2
    assert seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id) == before


def test_decided_alert_can_change_and_preserves_draft(client, seed, alert_id):
    for decision in ("archive", "report", "archive", "escalate", "report"):
        resp = client.post(
            f"/alerts/{alert_id}/decision",
            json={"decision": decision, "justification": JUSTIFICATION},
        )
        assert resp.status_code == 200
        assert seed.count("reports") == (0 if seed.count("decisions") == 1 else 1)
    assert seed.count("decisions") == seed.count("audit_log") == 5


@pytest.mark.parametrize("scenario", ["archive", "report", "reuse"])
def test_decision_late_failure_rolls_back_all_writes(client, seed, alert_id, monkeypatch, scenario):
    before = seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id)
    decision = "report" if scenario == "reuse" else scenario
    existing_report = None
    if scenario == "reuse":
        seed.report(alert_id, seed.decision(alert_id))
        existing_report = seed.row("SELECT * FROM reports")
    orig_audit = decisions._audit

    def fail(*args, **kwargs):
        orig_audit(*args, **kwargs)
        raise RuntimeError("Falha de auditoria simulada")

    monkeypatch.setattr(decisions, "_audit", fail)
    with pytest.raises(RuntimeError, match="Falha de auditoria simulada"):
        client.post(
            f"/alerts/{alert_id}/decision",
            json={"decision": decision, "justification": JUSTIFICATION},
        )
    assert seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id) == before
    assert seed.count("audit_log") == 0
    assert seed.count("decisions") == (1 if existing_report else 0)
    assert seed.count("reports") == (1 if existing_report else 0)
    assert seed.row("SELECT * FROM reports") == existing_report
