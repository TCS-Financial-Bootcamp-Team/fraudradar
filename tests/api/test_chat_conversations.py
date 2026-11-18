"""Testes HTTP + Postgres de histórico de conversas, page_state e ferramentas do agente."""

from __future__ import annotations

import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from google.genai import errors as genai_errors
from sqlalchemy import text

from api.dependencies import User, get_current_user
from api.main import create_app
from api.repositories import chat as chat_repo
from fraudradar.ai import chat_router, system_agent


def _set_gemini(monkeypatch, *, model: str = "gemini-2.5-flash", options: str = "") -> None:
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_MODEL", model)
    monkeypatch.setenv("LLM_MODEL_OPTIONS", options)
    monkeypatch.setenv("GEMINI_API_KEY", "chave-teste")
    from fraudradar.config import get_settings

    get_settings.cache_clear()


def _create_second_dataset(db, slug: str = "outro-ds") -> str:
    from fraudradar.datasets import create_dataset

    with db.begin() as conn:
        create_dataset(conn, slug=slug, name="Outro Dataset")
    return slug


# --- Histórico de conversas (CRUD + isolamento por dono e dataset) -----------------------


def test_conversation_created_on_first_message_and_reused_from_db(client, db, monkeypatch):
    _set_gemini(monkeypatch)
    captured_prompts: list[str] = []

    monkeypatch.setattr(
        chat_router, "_classify_from_settings", lambda **kwargs: '{"route":"domain"}'
    )

    def fake_domain(*, question, model=None, allowlist=None):
        captured_prompts.append(question)
        return "Resposta de domínio.", "gemini-2.5-flash"

    monkeypatch.setattr("api.chat_service.generate_domain_answer_with_model", fake_domain)

    # Primeira mensagem: cria conversa com título colapsado e limitado a 80 caracteres.
    first_msg = "   Explique   o   que   é   fan-out   " + "x" * 100
    r1 = client.post(
        "/chat",
        json={
            "message": first_msg,
            "context": {"page": "/dashboard", "week": "2023-01-02"},
            "history": [],
        },
    )
    assert r1.status_code == 200, r1.text
    p1 = r1.json()
    conv_id = p1["conversation_id"]
    assert isinstance(conv_id, int)
    assert p1["model"] == "gemini-2.5-flash"

    # Envia mais 4 turnos (total 10 mensagens no banco) para validar o limite de 6 do histórico.
    for i in range(4):
        resp = client.post(
            "/chat",
            json={
                "message": f"Pergunta {i} sobre fan-out",
                "context": {"page": "/dashboard", "week": "2023-01-02"},
                "history": [{"role": "user", "content": "HISTORICO_INJETADO_DO_CLIENTE"}],
                "conversation_id": conv_id,
            },
        )
        assert resp.status_code == 200

    # No último turno, o histórico vem do banco (últimas 6 falas) e ignora request.history.
    last_prompt = json.loads(captured_prompts[-1])
    assert len(last_prompt["history"]) == 6
    assert "HISTORICO_INJETADO_DO_CLIENTE" not in captured_prompts[-1]
    assert last_prompt["history"][-1]["role"] == "assistant"

    # Lista conversas
    listed = client.get("/chat/conversations?limit=30")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["id"] == conv_id
    assert len(items[0]["title"]) <= 80
    assert "  " not in items[0]["title"]
    assert items[0]["message_count"] == 10

    # Detalhe da conversa
    detail = client.get(f"/chat/conversations/{conv_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["id"] == conv_id
    assert len(body["messages"]) == 10
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][1]["role"] == "assistant"
    assert body["messages"][1]["model"] == "gemini-2.5-flash"

    # Exclusão
    deleted = client.delete(f"/chat/conversations/{conv_id}")
    assert deleted.status_code == 204
    assert client.get(f"/chat/conversations/{conv_id}").status_code == 404
    assert client.get("/chat/conversations").json() == []


def test_conversation_isolation_between_users_and_datasets(db, monkeypatch):
    _create_second_dataset(db, "outro-ds")
    _set_gemini(monkeypatch)
    monkeypatch.setenv("AUTH_DISABLED", "true")

    from fastapi.testclient import TestClient

    app = create_app()
    current_user = {"user": User(id="user-a", name="Ana")}
    app.dependency_overrides[get_current_user] = lambda: current_user["user"]

    try:
        with TestClient(app) as c:
            r = c.post(
                "/chat",
                json={
                    "message": "Oi",
                    "context": {"page": "/dashboard", "week": "2023-01-02"},
                    "history": [],
                },
            )
            assert r.status_code == 200
            conv_id = r.json()["conversation_id"]

            # Outro dataset -> 404 em GET, POST e DELETE
            assert (
                c.get(
                    f"/chat/conversations/{conv_id}", headers={"X-Dataset": "outro-ds"}
                ).status_code
                == 404
            )
            assert (
                c.post(
                    "/chat",
                    headers={"X-Dataset": "outro-ds"},
                    json={
                        "message": "Oi",
                        "context": {"page": "/dashboard", "week": "2023-01-02"},
                        "history": [],
                        "conversation_id": conv_id,
                    },
                ).status_code
                == 404
            )
            assert (
                c.delete(
                    f"/chat/conversations/{conv_id}", headers={"X-Dataset": "outro-ds"}
                ).status_code
                == 404
            )
            assert c.get("/chat/conversations", headers={"X-Dataset": "outro-ds"}).json() == []

            # Outro usuário no mesmo dataset -> 404
            current_user["user"] = User(id="user-b", name="Beto")
            assert c.get(f"/chat/conversations/{conv_id}").status_code == 404
            assert c.get("/chat/conversations").json() == []
            assert (
                c.post(
                    "/chat",
                    json={
                        "message": "Oi",
                        "context": {"page": "/dashboard", "week": "2023-01-02"},
                        "history": [],
                        "conversation_id": conv_id,
                    },
                ).status_code
                == 404
            )
            assert c.delete(f"/chat/conversations/{conv_id}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_failed_turn_does_not_create_or_append_conversation(client, db, monkeypatch):
    _set_gemini(monkeypatch)
    monkeypatch.setattr(
        chat_router, "_classify_from_settings", lambda **kwargs: '{"route":"domain"}'
    )
    monkeypatch.setattr(
        "api.chat_service.generate_domain_answer_with_model",
        lambda **kwargs: (_ for _ in ()).throw(genai_errors.ServerError(503, {"message": "down"})),
    )

    fail_first = client.post(
        "/chat",
        json={
            "message": "Explique fan-out",
            "context": {"page": "/dashboard", "week": "2023-01-02"},
            "history": [],
        },
    )
    assert fail_first.status_code == 503
    assert client.get("/chat/conversations").json() == []

    # Cria uma conversa válida e falha no segundo turno: nada novo é gravado.
    ok = client.post(
        "/chat",
        json={
            "message": "Oi",
            "context": {"page": "/dashboard", "week": "2023-01-02"},
            "history": [],
        },
    )
    conv_id = ok.json()["conversation_id"]
    fail_second = client.post(
        "/chat",
        json={
            "message": "Explique fan-out",
            "context": {"page": "/dashboard", "week": "2023-01-02"},
            "history": [],
            "conversation_id": conv_id,
        },
    )
    assert fail_second.status_code == 503
    detail = client.get(f"/chat/conversations/{conv_id}").json()
    assert len(detail["messages"]) == 2


# --- Page state + ferramentas do agente com Postgres real --------------------------------


def test_page_items_drops_unknown_and_other_dataset_ids_and_never_exposes_accounts(
    client, db, seed, monkeypatch
):
    _set_gemini(monkeypatch)
    _create_second_dataset(db, "outro-ds")

    week = date(2023, 6, 19)
    a1 = seed.alert(8865018891, week, score=0.92, position=1, typology="Fan-out")
    seed.decision(a1, decision="escalate")

    # Cria alerta em outro conjunto para garantir isolamento por X-Dataset.
    with db.begin() as conn:
        conn.execute(text("SET LOCAL search_path TO ds_outro_ds, public"))
        conn.execute(
            text(
                "INSERT INTO model_versions (version, features, threshold, active)"
                " VALUES ('test-v1', '[]'::jsonb, 0.5, true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO accounts (account, first_seen_at, last_seen_at)"
                " VALUES (9999888877, '2023-06-19', '2023-06-19')"
            )
        )
        conn.execute(text("ALTER TABLE ds_outro_ds.alerts ALTER COLUMN id RESTART WITH 7777"))
        other_id = conn.execute(
            text(
                "INSERT INTO alerts (account, week, score, queue_position, status, countries,"
                " typology, total_amount, transaction_count, model_version, origin)"
                " VALUES (9999888877, :w, 0.88, 1, 'new', ARRAY['UK'], 'Smurfing', 500, 2,"
                " 'test-v1', 'model') RETURNING id"
            ),
            {"w": week},
        ).scalar_one()

    monkeypatch.setattr(
        chat_router, "_classify_from_settings", lambda **kwargs: '{"route":"system"}'
    )

    seen_tool_responses: list[str] = []

    class FakeAgentClient:
        def __init__(self):
            self.step = 0

        @property
        def models(self):
            return self

        def generate_content(self, *, model, contents, config):
            self.step += 1
            seen_tool_responses.append(
                json.dumps([item.model_dump(mode="json") for item in contents], ensure_ascii=False)
            )
            if self.step == 1:
                return SimpleNamespace(
                    function_calls=[
                        SimpleNamespace(name="get_page_items", args={}),
                        SimpleNamespace(
                            name="suggest_link",
                            args={"target": "alert", "alert_id": a1, "label": f"Alerta {a1}"},
                        ),
                    ],
                    text=None,
                )
            return SimpleNamespace(
                function_calls=[],
                text=f"O alerta {a1} está com nota 92,0 e em investigação.",
            )

    with patch.object(system_agent.genai, "Client") as client_cls:
        client_cls.return_value.__enter__.return_value = FakeAgentClient()
        response = client.post(
            "/chat",
            json={
                "message": "Quais destes alertas têm nota acima de 80?",
                "context": {
                    "page": "/alerts",
                    "week": "2023-06-19",
                    "path": "/alerts",
                    "page_state": {
                        "filters": {"status": "pending", "search": "8865018891"},
                        "visible_alert_ids": [a1, other_id, 9999999],
                        "page": 1,
                        "total": 100,
                    },
                },
                "history": [],
            },
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["kind"] == "system"
    assert payload["links"] == [{"href": f"/alerts/{a1}", "label": f"Alerta {a1}"}]
    assert "8865018891" not in seen_tool_responses[0]
    assert "8865018891" not in seen_tool_responses[1]
    assert "9999888877" not in seen_tool_responses[1]
    assert f'"alert_id": {a1}' in seen_tool_responses[1]
    assert '"total_amount_gbp":' in seen_tool_responses[1]
    assert '"total_amount":' not in seen_tool_responses[1]
    assert str(other_id) not in seen_tool_responses[1]
    assert "9999999" not in seen_tool_responses[1]


def test_agent_db_tools_read_without_accounts_or_ground_truth(db, seed):
    week = date(2023, 6, 19)
    seed.batch(week, active_accounts=500)
    a1 = seed.alert(8865018891, week, score=0.95, position=1, typology="Fan-out")
    seed.evidence(
        a1, contributions={"targets_7d": 0.9}, rules=[{"code": "R-01", "description": "Regra"}]
    )
    seed.decision(a1, decision="report")

    forbidden: set[str] = set()
    with db.connect() as conn:
        search = chat_repo.search_alerts_for_agent(
            conn,
            week="2023-06-19",
            min_score=90,
            typology="fan_out",
            forbidden_identifiers=forbidden,
        )
        assert search["count"] == 1
        assert search["alerts"][0]["alert_id"] == a1
        assert search["alerts"][0]["decision_type"] == "report"
        assert "total_amount_gbp" in search["alerts"][0]
        assert "total_amount" not in search["alerts"][0]
        assert "account" not in search["alerts"][0]

        visible = chat_repo.get_visible_alerts_for_agent(
            conn, alert_ids=[a1], forbidden_identifiers=forbidden
        )
        assert len(visible) == 1
        assert "total_amount_gbp" in visible[0]
        assert "total_amount" not in visible[0]

        detail = chat_repo.get_alert_summary_for_agent(conn, a1, forbidden_identifiers=forbidden)
        assert detail["alert_id"] == a1
        assert "financial_volume_gbp" in detail
        assert "8865018891" not in json.dumps(detail)

        weeks_list = chat_repo.list_weeks_for_agent(conn, dataset_slug="saml-d")
        assert weeks_list["count"] == 1
        assert weeks_list["weeks"][0]["alerts"] == 1

        summary = chat_repo.get_week_summary_for_agent(conn, week_str="2023-06-19")
        assert summary["queue_size"] == 1
        assert summary["mean_score"] == 95.0
        assert summary["decision_counts"]["report"] == 1
        assert "flagged_amount_gbp" in summary
        assert "flagged_amount" not in summary
    assert "8865018891" in forbidden


# --- Chat do alerta: persistência, isolamento e rota system -------------------------------


def test_alert_chat_persists_turn_mixes_with_global_and_ignores_client_history(
    client, db, seed, monkeypatch
):
    _set_gemini(monkeypatch)
    week = date(2023, 6, 19)
    a1 = seed.alert(8865018891, week, score=0.92, position=1, typology="Fan-out")
    seed.evidence(
        a1, contributions={"targets_7d": 0.9}, rules=[{"code": "R-01", "description": "x"}]
    )

    captured_prompts: list[str] = []
    monkeypatch.setattr(
        chat_router, "_classify_from_settings", lambda **kwargs: '{"route":"domain"}'
    )

    def fake_domain(*, question, model=None, allowlist=None):
        captured_prompts.append(question)
        return "Análise conceitual.", "gemini-2.5-flash"

    monkeypatch.setattr("api.chat_service.generate_domain_answer_with_model", fake_domain)

    # Primeiro turno no chat do alerta cria a conversa e devolve conversation_id.
    r1 = client.post(
        f"/alerts/{a1}/chat",
        json={
            "message": "O que verificar primeiro neste alerta?",
            "context": {
                "page": f"/alerts/{a1}",
                "week": "2023-06-19",
                "alert_id": str(a1),
                "path": f"/alerts/{a1}",
            },
            "history": [],
        },
    )
    assert r1.status_code == 200, r1.text
    conv_id = r1.json()["conversation_id"]
    assert isinstance(conv_id, int)

    # Segundo turno no chat global (/chat) reutiliza a mesma conversa.
    r2 = client.post(
        "/chat",
        json={
            "message": "Explique fan-out",
            "context": {"page": "/dashboard", "week": "2023-06-19"},
            "history": [],
            "conversation_id": conv_id,
        },
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["conversation_id"] == conv_id

    # Terceiro turno volta ao chat do alerta: lê histórico do banco e ignora request.history.
    r3 = client.post(
        f"/alerts/{a1}/chat",
        json={
            "message": "E como comparar com outras semanas?",
            "context": {
                "page": f"/alerts/{a1}",
                "week": "2023-06-19",
                "alert_id": str(a1),
                "path": f"/alerts/{a1}",
            },
            "history": [{"role": "user", "content": "HISTORICO_INJETADO_DO_CLIENTE"}],
            "conversation_id": conv_id,
        },
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["conversation_id"] == conv_id
    assert "Explique fan-out" in captured_prompts[-1]
    assert "HISTORICO_INJETADO_DO_CLIENTE" not in captured_prompts[-1]

    detail = client.get(f"/chat/conversations/{conv_id}")
    assert detail.status_code == 200
    assert len(detail.json()["messages"]) == 6


def test_alert_chat_rejects_other_users_or_other_dataset_conversation_with_404(
    db, seed, monkeypatch
):
    _create_second_dataset(db, "outro-ds")
    _set_gemini(monkeypatch)
    monkeypatch.setenv("AUTH_DISABLED", "true")

    week = date(2023, 6, 19)
    a1 = seed.alert(8865018891, week, score=0.92, position=1, typology="Fan-out")

    from fastapi.testclient import TestClient

    app = create_app()
    current_user = {"user": User(id="user-a", name="Ana")}
    app.dependency_overrides[get_current_user] = lambda: current_user["user"]

    try:
        with TestClient(app) as c:
            created = c.post(
                "/chat",
                json={
                    "message": "Oi",
                    "context": {"page": "/dashboard", "week": "2023-06-19"},
                    "history": [],
                },
            )
            assert created.status_code == 200
            conv_id = created.json()["conversation_id"]

            # Outro dataset no chat do alerta -> 404 chat.conversation_not_found
            other_ds = c.post(
                f"/alerts/{a1}/chat",
                headers={"X-Dataset": "outro-ds"},
                json={
                    "message": "Oi",
                    "context": {"page": f"/alerts/{a1}", "week": "2023-06-19"},
                    "history": [],
                    "conversation_id": conv_id,
                },
            )
            assert other_ds.status_code == 404
            assert other_ds.json()["code"] == "chat.conversation_not_found"

            # Outro usuário no mesmo dataset -> 404 chat.conversation_not_found
            current_user["user"] = User(id="user-b", name="Beto")
            other_user = c.post(
                f"/alerts/{a1}/chat",
                json={
                    "message": "Oi",
                    "context": {"page": f"/alerts/{a1}", "week": "2023-06-19"},
                    "history": [],
                    "conversation_id": conv_id,
                },
            )
            assert other_user.status_code == 404
            assert other_user.json()["code"] == "chat.conversation_not_found"
    finally:
        app.dependency_overrides.clear()


def test_alert_chat_system_route_returns_kind_system_with_links_and_alert_page_context(
    client, db, seed, monkeypatch
):
    _set_gemini(monkeypatch)
    week = date(2023, 6, 19)
    a1 = seed.alert(8865018891, week, score=0.94, position=1, typology="Fan-out")
    seed.evidence(
        a1,
        contributions={"targets_7d": 0.9},
        rules=[{"code": "R-014", "description": "Múltiplos destinatários"}],
    )

    monkeypatch.setattr(
        chat_router, "_classify_from_settings", lambda **kwargs: '{"route":"system"}'
    )

    seen_contents: list[str] = []

    class FakeAgentClient:
        def __init__(self):
            self.step = 0

        @property
        def models(self):
            return self

        def generate_content(self, *, model, contents, config):
            self.step += 1
            seen_contents.append(
                json.dumps([item.model_dump(mode="json") for item in contents], ensure_ascii=False)
            )
            if self.step == 1:
                return SimpleNamespace(
                    function_calls=[
                        SimpleNamespace(name="get_alert", args={"alert_id": a1}),
                        SimpleNamespace(
                            name="suggest_link",
                            args={"target": "monitoring", "label": "Abrir monitoramento"},
                        ),
                    ],
                    text=None,
                )
            return SimpleNamespace(
                function_calls=[],
                text=f"O alerta {a1} tem nota 94,0 e está pendente na fila.",
            )

    with patch.object(system_agent.genai, "Client") as client_cls:
        client_cls.return_value.__enter__.return_value = FakeAgentClient()
        response = client.post(
            f"/alerts/{a1}/chat",
            json={
                "message": "Resuma este alerta e me leve ao monitoramento",
                "context": {
                    "page": f"/alerts/{a1}",
                    "week": "2023-06-19",
                    "alert_id": str(a1),
                    "path": f"/alerts/{a1}",
                },
                "history": [],
            },
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["kind"] == "system"
    assert payload["links"] == [{"href": "/monitoring", "label": "Abrir monitoramento"}]
    assert isinstance(payload["conversation_id"], int)
    initial_prompt = json.loads(json.loads(seen_contents[0])[0]["parts"][0]["text"])
    assert initial_prompt["page_context"] == {
        "page": "alert",
        "week": "2023-06-19",
        "path": f"/alerts/{a1}",
        "alert_id": a1,
    }
    assert "94.0" in seen_contents[1]
    assert "8865018891" not in seen_contents[1]

    detail = client.get(f"/chat/conversations/{payload['conversation_id']}").json()
    assert detail["messages"][1]["kind"] == "system"
    assert detail["messages"][1]["links"] == [
        {"href": "/monitoring", "label": "Abrir monitoramento"}
    ]
