"""Rascunho, aprovação, bloqueio de linha e atomicidade no Postgres."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from threading import Barrier
from time import monotonic, sleep

import pytest
from sqlalchemy import text

from api.dependencies import LOCAL_USER, User, get_current_user
from api.repositories import decisions

JUSTIFICATION = "Há indícios suficientes para comunicar a operação."
APPROVED_CONTENT = "Comunicação revisada e aprovada pelo analista responsável."


@pytest.fixture
def alert_id(seed):
    return seed.alert(
        123456789,
        date(2023, 1, 2),
        status="reported",
        countries=("UK", "BR"),
        total_amount=1234567.89,
        transaction_count=17,
    )


@pytest.fixture
def draft_id(seed, alert_id):
    decision_id = seed.decision(alert_id)
    return seed.report(alert_id, decision_id)


@pytest.mark.parametrize("approve", [False, True], ids=["get", "approve"])
@pytest.mark.parametrize("alert_exists", [False, True], ids=["no_alert", "no_report"])
def test_missing_report_returns_404(client, seed, alert_id, approve, alert_exists):
    target_id = alert_id if alert_exists else 999
    url = f"/alerts/{target_id}/report"
    resp = (
        client.post(f"{url}/approve", json={"content": APPROVED_CONTENT})
        if approve
        else client.get(url)
    )
    assert resp.status_code == 404
    assert seed.count("reports") == seed.count("audit_log") == 0
    assert seed.count("decisions") == 0


@pytest.mark.parametrize("approved", [False, True], ids=["draft", "approved"])
def test_get_report_contract_and_timestamp(client, seed, alert_id, approved):
    decision_id = seed.decision(alert_id)
    report_id = seed.report(alert_id, decision_id, approved_by="Revisora" if approved else None)
    stored = seed.row("SELECT * FROM reports WHERE id = :id", id=report_id)
    resp = client.get(f"/alerts/{alert_id}/report")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["alert_id"] == str(alert_id)
    assert payload["content"] == stored["draft"]
    assert payload["status"] == ("approved" if approved else "draft")
    expected_ts = stored["approved_at"] if approved else stored["created_at"]
    assert datetime.fromisoformat(payload["updated_at"]) == expected_ts
    assert seed.count("audit_log") == 0


@pytest.mark.parametrize("tie", [False, True], ids=["timestamp", "id_tiebreak"])
def test_get_latest_report_for_alert(client, seed, db, alert_id, tie):
    decision_id = seed.decision(alert_id)
    if tie:
        seed.report(alert_id, decision_id, "Rascunho anterior empatado na data de criação.")
    expected_id = seed.report(alert_id, decision_id, "Rascunho mais recente selecionado pelo GET.")
    if not tie:
        older_id = seed.report(alert_id, decision_id, "Rascunho antigo com id maior.")
        with db.begin() as conn:
            conn.execute(
                text("UPDATE reports SET created_at = '2020-01-01' WHERE id = :id"),
                {"id": older_id},
            )
    else:
        with db.begin() as conn:
            conn.execute(text("UPDATE reports SET created_at = '2025-01-01'"))
    other_alert = seed.alert(999, date(2023, 1, 2))
    seed.report(other_alert, seed.decision(other_alert), "Rascunho de outro alerta mais novo.")
    resp = client.get(f"/alerts/{alert_id}/report")
    assert resp.status_code == 200
    stored = seed.row("SELECT * FROM reports WHERE id = :id", id=expected_id)
    assert resp.json()["content"] == stored["draft"]


def test_approval_saves_content_author_audit_and_timestamp(client, seed, db, alert_id, draft_id):
    with db.begin() as conn:
        conn.execute(text("UPDATE reports SET created_at = '2020-01-01'"))
    before = client.get(f"/alerts/{alert_id}/report").json()
    resp = client.post(
        f"/alerts/{alert_id}/report/approve", json={"content": f"  {APPROVED_CONTENT}\n"}
    )
    assert resp.status_code == 200, resp.text
    after = resp.json()
    stored = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    assert after["alert_id"] == str(alert_id)
    assert after["status"] == stored["status"] == "approved"
    assert after["content"] == stored["draft"] == APPROVED_CONTENT
    assert stored["approved_by"] == LOCAL_USER.name
    assert datetime.fromisoformat(after["updated_at"]) == stored["approved_at"]
    assert datetime.fromisoformat(before["updated_at"]) == stored["created_at"]
    assert stored["approved_at"] > stored["created_at"]
    assert client.get(f"/alerts/{alert_id}/report").json() == after
    assert seed.count("reports") == 1
    assert seed.count("decisions") == 1
    assert seed.count("audit_log") == 1
    audit = seed.row("SELECT * FROM audit_log")
    assert audit["action"] == "report_approved"
    assert audit["actor"] == LOCAL_USER.name
    assert audit["entity"] == "alert"
    assert audit["entity_id"] == str(alert_id)
    assert audit["details"] == {"report_id": draft_id, "user_id": LOCAL_USER.id}


def test_approval_uses_authenticated_user(client, seed, alert_id, draft_id):
    user = User(id="reviewer-77", name="Maria Revisora")
    client.app.dependency_overrides[get_current_user] = lambda: user
    try:
        resp = client.post(
            f"/alerts/{alert_id}/report/approve",
            json={"content": APPROVED_CONTENT, "approved_by": "Nome falsificado"},
        )
    finally:
        client.app.dependency_overrides.pop(get_current_user)
    assert resp.status_code == 200
    stored = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    assert stored["approved_by"] == user.name
    audit = seed.row("SELECT * FROM audit_log")
    assert audit["actor"] == user.name
    assert audit["details"]["user_id"] == user.id


@pytest.mark.parametrize("content", ["  " + "a" * 29 + "  ", " " * 40, "a" * 20001])
def test_approval_invalid_content_after_trim(client, seed, alert_id, draft_id, content):
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    resp = client.post(f"/alerts/{alert_id}/report/approve", json={"content": content})
    assert resp.status_code == 422
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id) == before
    assert seed.count("audit_log") == 0


def test_duplicate_approval_does_not_write(client, seed, alert_id, draft_id):
    url = f"/alerts/{alert_id}/report/approve"
    assert client.post(url, json={"content": APPROVED_CONTENT}).status_code == 200
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    audit = seed.row("SELECT * FROM audit_log")
    resp = client.post(url, json={"content": "Outro texto que não deve substituir o aprovado."})
    assert resp.status_code == 409
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id) == before
    assert seed.row("SELECT * FROM audit_log") == audit
    assert seed.count("audit_log") == seed.count("decisions") == 1


def test_prior_approval_locks_alert_even_with_newer_draft(client, seed, alert_id, draft_id):
    url = f"/alerts/{alert_id}/report/approve"
    assert client.post(url, json={"content": APPROVED_CONTENT}).status_code == 200
    decision_id = seed.decision(alert_id)
    newer_id = seed.report(alert_id, decision_id)
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=newer_id)
    assert client.post(url, json={"content": APPROVED_CONTENT}).status_code == 409
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=newer_id) == before
    assert seed.count("audit_log") == 1


@pytest.mark.parametrize("decision", ["archive", "escalate"])
def test_approval_blocked_after_changing_decision(client, seed, alert_id, draft_id, decision):
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    request = {"decision": decision, "justification": JUSTIFICATION}
    if decision == "archive":
        request["archive_reason"] = "insufficient_evidence"
    assert client.post(f"/alerts/{alert_id}/decision", json=request).status_code == 200
    resp = client.post(f"/alerts/{alert_id}/report/approve", json={"content": APPROVED_CONTENT})
    assert resp.status_code == 409
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id) == before
    assert seed.count("reports") == 1
    assert seed.count("decisions") == 2
    assert seed.count("audit_log") == 1


@pytest.mark.parametrize("alert_status", ["new", "in_review", "archived", "escalated"])
def test_approval_requires_reported_status(client, seed, db, alert_id, draft_id, alert_status):
    with db.begin() as conn:
        conn.execute(
            text("UPDATE alerts SET status = :status WHERE id = :id"),
            {"id": alert_id, "status": alert_status},
        )
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    resp = client.post(f"/alerts/{alert_id}/report/approve", json={"content": APPROVED_CONTENT})
    assert resp.status_code == 409
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id) == before
    assert seed.count("audit_log") == 0
    assert seed.count("decisions") == 1


@pytest.mark.parametrize("tie", [False, True], ids=["timestamp", "id_tiebreak"])
def test_approval_updates_only_latest_report(client, seed, db, alert_id, tie):
    decision_id = seed.decision(alert_id)
    if tie:
        other_id = seed.report(alert_id, decision_id)
    expected_id = seed.report(alert_id, decision_id)
    if not tie:
        other_id = seed.report(alert_id, decision_id)
    with db.begin() as conn:
        conn.execute(text("UPDATE reports SET created_at = '2025-01-01'"))
        if not tie:
            conn.execute(
                text("UPDATE reports SET created_at = '2020-01-01' WHERE id = :id"),
                {"id": other_id},
            )
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=other_id)
    resp = client.post(f"/alerts/{alert_id}/report/approve", json={"content": APPROVED_CONTENT})
    assert resp.status_code == 200
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=other_id) == before
    assert seed.row("SELECT status FROM reports WHERE id = :id", id=expected_id) == {
        "status": "approved"
    }
    assert seed.row("SELECT details FROM audit_log")["details"]["report_id"] == expected_id


@pytest.mark.parametrize("with_assessment", [False, True])
def test_draft_deterministic_content_and_length_limit(client, seed, alert_id, with_assessment):
    if with_assessment:
        seed.assessment(alert_id, "Parecer mais recente. " + "x" * 25000)
    req = {"decision": "report", "justification": JUSTIFICATION}
    assert client.post(f"/alerts/{alert_id}/decision", json=req).status_code == 200
    stored = seed.row("SELECT * FROM reports")
    draft = stored["draft"]
    assert draft.startswith("COMUNICAÇÃO DE OPERAÇÃO SUSPEITA — SIMULAÇÃO ACADÊMICA")
    for snippet in (
        "Conta: 123456789",
        "02/01/2023 a 08/01/2023",
        "Nota de risco do modelo: 90,0 de 100",
        "Fan-out",
        "1.234.567,89",
        "17",
        "UK, BR",
        JUSTIFICATION,
    ):
        assert snippet in draft
    assert 30 <= len(draft) <= 20000
    if with_assessment:
        assert "Parecer mais recente." in draft
        assert len(draft) == 20000
    else:
        assert "Parecer mais recente" not in draft
    assert draft.endswith(
        "Rascunho gerado pelo FraudRadar PLD. Deve ser revisado antes da aprovação."
    )
    with seed.engine.connect() as conn:
        row = decisions.get_alert_row(conn, alert_id)
        assessment = "Parecer mais recente. " + "x" * 25000 if with_assessment else None
        assert decisions.build_report_draft(row, JUSTIFICATION, assessment) == draft


def test_draft_converts_latest_assessment_markdown_to_plain_text(client, seed, alert_id):
    assessment = "# **Sinais observados**\n\n* Padrão `fan_out` documentado [F1]."
    seed.assessment(alert_id, assessment)

    response = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": "report", "justification": JUSTIFICATION},
    )

    assert response.status_code == 200
    draft = seed.row("SELECT draft FROM reports WHERE alert_id = :id", id=alert_id)["draft"]
    assert "Parecer mais recente:\nSinais observados\n\n- Padrão fan_out documentado [F1]." in draft
    assert "**" not in draft
    assert "# Sinais" not in draft
    assert "* " not in draft
    assert (
        seed.row(
            "SELECT content FROM assessments WHERE alert_id = :id",
            id=alert_id,
        )["content"]
        == assessment
    )


def test_draft_undefined_typology_and_countries(client, seed):
    aid = seed.alert(77, date(2023, 1, 2), typology=None, countries=())
    resp = client.post(
        f"/alerts/{aid}/decision",
        json={"decision": "report", "justification": JUSTIFICATION},
    )
    assert resp.status_code == 200
    draft = seed.row("SELECT draft FROM reports")["draft"]
    assert "Tipologia prevista: Indefinida" in draft
    assert "Nota de risco do modelo: 90,0 de 100 (ordena a fila; não é probabilidade)" in draft
    assert "%" not in draft
    assert "Países: Indefinidos" in draft


def test_draft_long_metadata_respects_length_limit(client, seed):
    aid = seed.alert(77, date(2023, 1, 2), typology="T" * 22000)
    resp = client.post(
        f"/alerts/{aid}/decision",
        json={"decision": "report", "justification": JUSTIFICATION},
    )
    assert resp.status_code == 200
    draft = seed.row("SELECT draft FROM reports")["draft"]
    assert len(draft) == 20000
    assert draft.endswith("Deve ser revisado antes da aprovação.")


def test_approval_late_failure_rolls_back_writes(client, seed, alert_id, draft_id, monkeypatch):
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id)
    orig_audit = decisions._audit

    def fail(*args, **kwargs):
        orig_audit(*args, **kwargs)
        raise RuntimeError("Falha de auditoria simulada")

    monkeypatch.setattr(decisions, "_audit", fail)
    with pytest.raises(RuntimeError, match="Falha de auditoria simulada"):
        client.post(f"/alerts/{alert_id}/report/approve", json={"content": APPROVED_CONTENT})
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=draft_id) == before
    assert seed.count("audit_log") == 0
    assert seed.count("decisions") == 1


@pytest.mark.parametrize("other_approved", [False, True], ids=["draft", "approved"])
def test_writes_isolate_other_alerts(client, seed, alert_id, other_approved):
    other_alert = seed.alert(999, date(2023, 1, 2), status="reported")
    other_report = seed.report(
        other_alert,
        seed.decision(other_alert),
        approved_by="Revisora" if other_approved else None,
    )
    before = seed.row("SELECT * FROM reports WHERE id = :id", id=other_report)
    resp = client.post(
        f"/alerts/{alert_id}/decision",
        json={"decision": "report", "justification": JUSTIFICATION},
    )
    assert resp.status_code == 200
    assert seed.count("reports", "alert_id = :id", id=alert_id) == 1
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=other_report) == before
    resp = client.post(f"/alerts/{alert_id}/report/approve", json={"content": APPROVED_CONTENT})
    assert resp.status_code == 200
    assert seed.row("SELECT * FROM reports WHERE id = :id", id=other_report) == before
    assert seed.row("SELECT status FROM reports WHERE alert_id = :id", id=alert_id) == {
        "status": "approved"
    }


@pytest.mark.parametrize("approve", [False, True], ids=["decision", "approve"])
def test_write_locks_alert_before_writing(client, seed, db, alert_id, draft_id, approve):
    url = f"/alerts/{alert_id}/report/approve" if approve else f"/alerts/{alert_id}/decision"
    req = (
        {"content": APPROVED_CONTENT}
        if approve
        else {"decision": "report", "justification": JUSTIFICATION}
    )
    with ThreadPoolExecutor(max_workers=1) as executor:
        with db.begin() as conn:
            pid = conn.execute(text("SELECT pg_backend_pid()")).scalar_one()
            conn.execute(text("SELECT id FROM alerts WHERE id = :id FOR UPDATE"), {"id": alert_id})
            future = executor.submit(client.post, url, json=req)
            deadline = monotonic() + 5
            blocked = None
            while monotonic() < deadline:
                blocked = seed.row(
                    "SELECT query FROM pg_stat_activity WHERE :pid = ANY(pg_blocking_pids(pid))",
                    pid=pid,
                )
                if blocked is not None or future.done():
                    break
                sleep(0.02)
            assert blocked is not None, "A requisição não esperou pelo bloqueio do alerta."
            assert "FOR UPDATE" in blocked["query"]
            assert "FROM alerts" in blocked["query"]
            assert seed.count("audit_log") == 0
            assert seed.count("decisions") == 1
            assert seed.row("SELECT status FROM reports WHERE id = :id", id=draft_id) == {
                "status": "draft"
            }
        assert future.result(timeout=5).status_code == 200


@pytest.mark.parametrize("approve", [False, True], ids=["report", "approve"])
def test_concurrent_writes_serialized(client, seed, alert_id, approve):
    if approve:
        seed.report(alert_id, seed.decision(alert_id))
    barrier = Barrier(2)

    def send():
        barrier.wait(timeout=5)
        if approve:
            return client.post(
                f"/alerts/{alert_id}/report/approve", json={"content": APPROVED_CONTENT}
            ).status_code
        return client.post(
            f"/alerts/{alert_id}/decision",
            json={"decision": "report", "justification": JUSTIFICATION},
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(send) for _ in range(2)]
        statuses = sorted(f.result(timeout=10) for f in futures)
    assert statuses == ([200, 409] if approve else [200, 200])
    assert seed.count("reports") == 1
    assert seed.count("audit_log") == (1 if approve else 2)
    assert seed.count("decisions") == (1 if approve else 2)
