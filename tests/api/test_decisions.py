"""Decisões transacionais do analista contra Postgres."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from api.dependencies import LOCAL_USER, User, get_current_user
from api.repositories import decisions

JUSTIFICATION = "Movimentação incompatível com o perfil observado."


@pytest.fixture
def alert_id(seed):
    return seed.alert(123456789, date(2023, 1, 2), countries=("UK", "BR"))


def _request(decision: str, reason: str | None = "false_positive", **extra) -> dict:
    """Pedido de decisão; arquivar leva o motivo (padrão: falso positivo confirmado)."""
    body = {"decision": decision, "justification": JUSTIFICATION, **extra}
    if decision == "archive" and reason is not None:
        body["archive_reason"] = reason
    return body


def _decide(client, alert_id, decision: str, reason: str | None = "false_positive"):
    return client.post(f"/alerts/{alert_id}/decision", json=_request(decision, reason))


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
        json=_request(decision, justification=f"  {JUSTIFICATION}\n"),
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
        "queue_position": 1,
        "origin": "model",
    }
    current = seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id)
    assert current["status"] == db_status
    assert current["updated_at"] > before["updated_at"]
    stored = seed.row("SELECT * FROM decisions WHERE alert_id = :id", id=alert_id)
    assert stored["decision"] == decision
    assert stored["archive_reason"] == ("false_positive" if decision == "archive" else None)
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
    reason = {"archive_reason": "false_positive"} if decision == "archive" else {}
    assert audit["details"] == {
        "decision": decision,
        "decision_id": stored["id"],
        "user_id": LOCAL_USER.id,
        **reason,
    }
    assert seed.count("reports") == (1 if decision == "report" else 0)


@pytest.mark.parametrize("justification", ["   curta   ", " " * 15, "a" * 4001])
def test_decision_invalid_justification_after_trim(client, seed, alert_id, justification):
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json=_request("archive", justification=justification),
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
            json=_request("archive", analyst="Nome falsificado"),
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
    resp = _decide(client, alert_id, decision)
    assert resp.status_code == 409
    assert seed.count("decisions") == 1
    assert seed.count("audit_log") == 0
    assert seed.count("analyst_labels") == 0
    assert seed.count("reports") == 2
    assert seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id) == before


def test_decided_alert_can_change_and_preserves_draft(client, seed, alert_id):
    for decision in ("archive", "report", "archive", "escalate", "report"):
        resp = _decide(client, alert_id, decision)
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
        _decide(client, alert_id, decision)
    assert seed.row("SELECT * FROM alerts WHERE id = :id", id=alert_id) == before
    assert seed.count("audit_log") == 0
    assert seed.count("analyst_labels") == 0  # o rótulo cai junto com a decisão
    assert seed.count("decisions") == (1 if existing_report else 0)
    assert seed.count("reports") == (1 if existing_report else 0)
    assert seed.row("SELECT * FROM reports") == existing_report


# --- motivo do arquivamento e rótulos do retorno dos analistas -----------------------------


def test_archive_without_reason_is_rejected(client, seed, alert_id):
    resp = _decide(client, alert_id, "archive", reason=None)
    assert resp.status_code == 422
    assert "motivo do arquivamento" in resp.text
    assert seed.count("decisions") == seed.count("audit_log") == seed.count("analyst_labels") == 0


@pytest.mark.parametrize("decision", ["escalate", "report"])
def test_reason_on_other_decisions_is_rejected(client, seed, alert_id, decision):
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={
            "decision": decision,
            "justification": JUSTIFICATION,
            "archive_reason": "false_positive",
        },
    )
    assert resp.status_code == 422
    assert "só vale para a decisão de arquivar" in resp.text
    assert seed.count("decisions") == seed.count("analyst_labels") == 0


def test_unknown_reason_is_rejected(client, seed, alert_id):
    resp = _decide(client, alert_id, "archive", reason="sem tempo")
    assert resp.status_code == 422
    assert seed.count("decisions") == 0


@pytest.mark.parametrize(
    ("decision", "reason", "label"),
    [
        ("archive", "false_positive", 0),
        ("report", None, 1),
        ("archive", "insufficient_evidence", None),
        ("escalate", None, None),
    ],
)
def test_only_conclusive_decisions_leave_a_label(client, seed, alert_id, decision, reason, label):
    assert _decide(client, alert_id, decision, reason).status_code == 200
    stored = seed.row("SELECT * FROM decisions")
    assert stored["archive_reason"] == reason
    row = seed.row("SELECT * FROM analyst_labels")
    if label is None:
        assert row is None
        return
    assert (row["alert_id"], row["decision_id"]) == (alert_id, stored["id"])
    assert (row["account"], row["week"]) == (123456789, date(2023, 1, 2))
    assert (row["label"], row["origin"], row["source"]) == (label, "model", "analyst")


def test_later_decision_updates_or_removes_the_label(client, seed, alert_id):
    def label():
        return seed.row("SELECT label, decision_id, created_at, updated_at FROM analyst_labels")

    def latest_decision() -> int:
        return seed.row("SELECT id FROM decisions ORDER BY id DESC LIMIT 1")["id"]

    assert _decide(client, alert_id, "report").status_code == 200
    first = label()
    assert (first["label"], first["decision_id"]) == (1, latest_decision())

    assert _decide(client, alert_id, "archive", "false_positive").status_code == 200
    changed = label()
    assert (changed["label"], changed["decision_id"]) == (0, latest_decision())
    assert changed["created_at"] == first["created_at"]
    assert changed["updated_at"] > first["updated_at"]
    assert seed.count("analyst_labels") == 1  # uma linha por alerta: vale a última decisão

    assert _decide(client, alert_id, "archive", "insufficient_evidence").status_code == 200
    assert label() is None
    assert _decide(client, alert_id, "report").status_code == 200
    assert label()["label"] == 1
    assert _decide(client, alert_id, "escalate").status_code == 200
    assert label() is None
    assert seed.count("decisions") == 5  # o histórico das decisões fica inteiro


def test_label_copies_the_origin_of_a_control_sample_alert(client, seed):
    sampled = seed.alert(555, date(2023, 1, 2), score=0.02, position=9, origin="exploration")
    resp = _decide(client, sampled, "archive", "false_positive")
    assert resp.status_code == 200
    assert resp.json()["origin"] == "exploration"
    assert seed.row("SELECT origin, label FROM analyst_labels") == {
        "origin": "exploration",
        "label": 0,
    }


def test_legacy_archive_without_reason_keeps_working(client, seed, alert_id):
    """Arquivamento de antes do motivo obrigatório: sem motivo e sem rótulo, o alerta continua
    abrindo e aceita uma decisão nova."""
    seed.decision(alert_id, "archive")
    seed._exec("UPDATE alerts SET status = 'archived' WHERE id = :id", id=alert_id)

    detail = client.get(f"/alerts/{alert_id}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "archived"
    assert seed.row("SELECT archive_reason FROM decisions")["archive_reason"] is None
    assert seed.count("analyst_labels") == 0

    assert _decide(client, alert_id, "archive", "false_positive").status_code == 200
    assert seed.row("SELECT label FROM analyst_labels")["label"] == 0
    assert seed.count("decisions") == 2


def test_database_refuses_a_reason_outside_archive(seed, alert_id):
    with pytest.raises(IntegrityError, match="decisions_archive_reason_check"):
        seed.decision(alert_id, "report", archive_reason="false_positive")
    with pytest.raises(IntegrityError, match="decisions_archive_reason_check"):
        seed.decision(alert_id, "archive", archive_reason="sem tempo")
