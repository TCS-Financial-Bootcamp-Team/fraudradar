"""Ingestão de transações (CSV e avulsa) contra Postgres."""

import asyncio
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import text

from api.dependencies import LOCAL_USER, User, get_current_user
from api.repositories import ingestion
from api.schemas.ingestion import TransactionRequest
from fraudradar.config import get_settings
from fraudradar.data.schema import TRANSACTION_COLUMNS

HEADER = ",".join(TRANSACTION_COLUMNS)
ROW = "10:35:19,2022-10-07,8724731955,2769355426,1459.15,UK pounds,Euro,UK,France,Cross-border"
TRANSACTION_PAYLOAD = {
    "Time": "10:35",
    "Date": "2022-10-07",
    "Sender_account": "8724731955",
    "Receiver_account": "2769355426",
    "Amount": 1459.15,
    "Payment_currency": "UK pounds",
    "Received_currency": "Euro",
    "Sender_bank_location": "UK",
    "Receiver_bank_location": "France",
    "Payment_type": "Cross-border",
}


def _csv(*rows: str, header: str = HEADER) -> bytes:
    return "\n".join([header, *rows, ""]).encode()


def _upload(client, content: bytes, filename: str = "extrato.csv"):
    return client.post("/ingestion/csv", files={"file": (filename, content, "text/csv")})


def _rows(db, sql: str) -> list[dict]:
    with db.connect() as conn:
        return [dict(r) for r in conn.execute(text(sql)).mappings()]


def _nothing_saved(seed) -> bool:
    return all(
        seed.count(table) == 0
        for table in ("transactions", "ingestions", "audit_log", "ground_truth")
    )


@pytest.fixture
def set_limit(monkeypatch):
    """Troca INGESTION_MAX_BYTES / INGESTION_MAX_ROWS só neste teste."""

    def override(var_name: str, val: int) -> None:
        monkeypatch.setenv(var_name, str(val))
        get_settings.cache_clear()

    return override


# --- POST /ingestion/csv ---------------------------------------------------------------------


def test_valid_csv_saves_all_rows_and_returns_receipt(client, seed, db):
    extremes = "23:59,2023-01-02,1,9223372036854775807,0.01,Yen,Yen,Japan,Japan,Cash Deposit"
    resp = _upload(client, _csv(ROW, "", extremes))
    assert resp.status_code == 201, resp.text
    receipt = resp.json()
    assert receipt["status"] == "received"
    assert receipt["message"].startswith("2 transações recebidas.")
    ing = seed.row("SELECT * FROM ingestions")
    assert str(ing["id"]) == receipt["id"]
    assert (ing["source"], ing["file_name"], ing["row_count"]) == ("csv", "extrato.csv", 2)
    assert (ing["status"], ing["created_by"]) == ("received", LOCAL_USER.name)
    saved = _rows(db, "SELECT * FROM transactions ORDER BY id")
    assert [{k: v for k, v in t.items() if k != "id"} for t in saved] == [
        {
            "occurred_at": datetime(2022, 10, 7, 10, 35, 19),
            "sender": 8724731955,
            "receiver": 2769355426,
            "amount": Decimal("1459.15"),
            "payment_currency": "UK pounds",
            "received_currency": "Euro",
            "sender_country": "UK",
            "receiver_country": "France",
            "payment_type": "Cross-border",
            "ingestion_id": ing["id"],
        },
        {
            "occurred_at": datetime(2023, 1, 2, 23, 59),
            "sender": 1,
            "receiver": 2**63 - 1,
            "amount": Decimal("0.01"),
            "payment_currency": "Yen",
            "received_currency": "Yen",
            "sender_country": "Japan",
            "receiver_country": "Japan",
            "payment_type": "Cash Deposit",
            "ingestion_id": ing["id"],
        },
    ]
    assert seed.count("ground_truth") == 0


def test_csv_with_reordered_columns_bom_and_crlf(client, seed):
    header = ",".join(reversed(TRANSACTION_COLUMNS))
    row = ",".join(reversed(ROW.split(",")))
    content = b"\xef\xbb\xbf" + _csv(row, row, header=header).replace(b"\n", b"\r\n")
    assert _upload(client, content).status_code == 201
    assert seed.count("transactions", "sender = 8724731955 AND amount = 1459.15") == 2


@pytest.mark.parametrize(
    "labels", [["Is_laundering"], ["Laundering_type"], ["Is_laundering", "Laundering_type"]]
)
def test_csv_with_ground_truth_column_is_rejected(client, seed, labels):
    vals = {"Is_laundering": "1", "Laundering_type": "Structuring"}
    content = _csv(
        ",".join([ROW, *(vals[r] for r in labels)]),
        header=",".join([HEADER, *labels]),
    )
    resp = _upload(client, content)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert [e["loc"] for e in detail] == [["body", "file", 1, r] for r in labels]
    assert all("Rótulo de avaliação não entra pela API" in e["msg"] for e in detail)
    assert _nothing_saved(seed)


def test_csv_missing_column_is_rejected(client, seed):
    without_amount = [c for c in TRANSACTION_COLUMNS if c != "Amount"]
    resp = _upload(client, _csv(ROW, header=",".join(without_amount)))
    assert resp.status_code == 422
    assert resp.json()["detail"] == [
        {
            "type": "value_error",
            "loc": ["body", "file", 1, "Amount"],
            "msg": "Linha 1, coluna Amount: Coluna obrigatória ausente.",
        }
    ]
    assert _nothing_saved(seed)


def test_csv_with_one_bad_row_saves_nothing(client, seed):
    bad = ROW.replace("1459.15", "-3")
    resp = _upload(client, _csv(ROW, ROW, bad, ROW))
    assert resp.status_code == 422
    assert resp.json()["detail"] == [
        {
            "type": "value_error",
            "loc": ["body", "file", 4, "Amount"],
            "msg": "Linha 4, coluna Amount: O valor deve ser maior que zero.",
        }
    ]
    assert _nothing_saved(seed)


def test_csv_lists_only_first_20_errors(client, seed):
    bad_rows = [ROW.replace("10:35:19", "99:00")] * 30
    detail = _upload(client, _csv(*bad_rows)).json()["detail"]
    assert [e["loc"] for e in detail] == [["body", "file", n, "Time"] for n in range(2, 22)]
    assert _nothing_saved(seed)


@pytest.mark.parametrize("acc", ["ACC-123", "12 34", "0123", "9223372036854775808"])
def test_csv_with_account_outside_positive_bigint_is_rejected(client, seed, acc):
    resp = _upload(client, _csv(ROW.replace("8724731955", acc)))
    assert resp.status_code == 422
    [err] = resp.json()["detail"]
    assert err["loc"] == ["body", "file", 2, "Sender_account"]
    assert _nothing_saved(seed)


@pytest.mark.parametrize(
    ("content", "msg"),
    [(b"", "O arquivo está vazio."), (_csv(), "O CSV não tem transações, só o cabeçalho.")],
)
def test_csv_without_transactions_is_rejected(client, seed, content, msg):
    resp = _upload(client, content)
    assert resp.status_code == 422
    assert resp.json()["detail"] == [{"type": "value_error", "loc": ["body", "file"], "msg": msg}]
    assert _nothing_saved(seed)


def test_csv_without_file_field_is_rejected(client, seed):
    resp = client.post("/ingestion/csv", files={"other": ("a.csv", _csv(ROW), "text/csv")})
    assert resp.status_code == 422
    assert _nothing_saved(seed)


def test_csv_above_byte_limit_returns_413(client, seed, set_limit):
    set_limit("INGESTION_MAX_BYTES", 2048)
    resp = _upload(client, _csv(*[ROW] * 30))
    assert resp.status_code == 413
    assert resp.json()["detail"] == (
        "O envio passa do limite de 2048 bytes. Divida o CSV em partes menores."
    )
    assert _nothing_saved(seed)


def test_csv_without_content_length_also_respects_limit(client, seed, set_limit):
    set_limit("INGESTION_MAX_BYTES", 2048)
    boundary = "boundary"

    def stream():  # gerador: o httpx manda em chunked, sem Content-Length
        yield (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file";'
            f' filename="a.csv"\r\nContent-Type: text/csv\r\n\r\n'
        ).encode()
        yield _csv(*[ROW] * 30)
        yield f"\r\n--{boundary}--\r\n".encode()

    resp = client.post(
        "/ingestion/csv",
        content=stream(),
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )
    assert resp.status_code == 413
    assert _nothing_saved(seed)


def test_limit_stops_reading_body_mid_stream(set_limit):
    """Os bytes são contados enquanto chegam: um envio grande é cortado sem ser lido todo."""
    set_limit("INGESTION_MAX_BYTES", 4096)
    from api.main import create_app

    chunks = [
        b'--x\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\n\r\n',
        *[b"a" * 1024] * 100,
    ]
    read_count = 0
    messages: list[dict] = []

    async def receive() -> dict:
        nonlocal read_count
        read_count += 1
        return {
            "type": "http.request",
            "body": chunks[read_count - 1],
            "more_body": read_count < 101,
        }

    async def send(msg: dict) -> None:
        messages.append(msg)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/ingestion/csv",
        "raw_path": b"/ingestion/csv",
        "query_string": b"",
        "root_path": "",
        "headers": [(b"content-type", b"multipart/form-data; boundary=x")],
        "client": ("test", 1),
        "server": ("test", 80),
    }
    asyncio.run(create_app()(scope, receive, send))
    assert messages[0]["status"] == 413
    assert read_count == 5  # 70 + 4 x 1024 bytes passam de 4 KiB; os outros 96 nem foram pedidos


def test_csv_above_row_limit_returns_413(client, seed, set_limit):
    set_limit("INGESTION_MAX_ROWS", 3)
    resp = _upload(client, _csv(*[ROW] * 4))
    assert resp.status_code == 413
    assert resp.json()["detail"] == ("O arquivo passa de 3 linhas. Divida o CSV em partes menores.")
    assert _nothing_saved(seed)
    assert _upload(client, _csv(*[ROW] * 3)).status_code == 201


def test_sanitized_file_name_strips_paths_and_control_chars():
    assert ingestion._sanitize_file_name("C:\\data\\ext\x00rato.csv") == "extrato.csv"
    assert ingestion._sanitize_file_name("../../etc/a.csv") == "a.csv"
    assert ingestion._sanitize_file_name("a" * 300) == "a" * 255
    assert ingestion._sanitize_file_name("") is None
    assert ingestion._sanitize_file_name(None) is None


# --- POST /ingestion/transactions ------------------------------------------------------------


def test_request_model_has_csv_columns():
    assert list(TransactionRequest.model_fields) == TRANSACTION_COLUMNS


def test_single_transaction_saves_and_returns_receipt(client, seed):
    resp = client.post(
        "/ingestion/transactions",
        json={**TRANSACTION_PAYLOAD, "Sender_account": " 8724731955 "},
    )
    assert resp.status_code == 201, resp.text
    receipt = resp.json()
    assert receipt["status"] == "received"
    assert receipt["message"].startswith("1 transação recebida.")
    ing = seed.row("SELECT * FROM ingestions")
    assert str(ing["id"]) == receipt["id"]
    assert (ing["source"], ing["file_name"], ing["row_count"]) == ("manual", None, 1)
    saved = seed.row("SELECT * FROM transactions")
    assert saved["occurred_at"] == datetime(2022, 10, 7, 10, 35)
    assert (saved["sender"], saved["receiver"]) == (8724731955, 2769355426)
    assert saved["amount"] == Decimal("1459.15")
    assert saved["ingestion_id"] == ing["id"]
    assert seed.count("ground_truth") == 0


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({**TRANSACTION_PAYLOAD, "Is_laundering": 1}, id="label"),
        pytest.param({**TRANSACTION_PAYLOAD, "channel": "app"}, id="extra-field"),
        pytest.param(
            {k: v for k, v in TRANSACTION_PAYLOAD.items() if k != "Date"}, id="missing-date"
        ),
        pytest.param({**TRANSACTION_PAYLOAD, "Amount": "1459.15"}, id="string-amount"),
        pytest.param({**TRANSACTION_PAYLOAD, "Sender_account": 8724731955}, id="numeric-account"),
    ],
)
def test_transaction_outside_contract_returns_422(client, seed, payload):
    assert client.post("/ingestion/transactions", json=payload).status_code == 422
    assert _nothing_saved(seed)


@pytest.mark.parametrize(
    ("field", "val"),
    [("Receiver_account", "ACC-1"), ("Time", "25:00"), ("Date", "2023-02-30")],
)
def test_transaction_with_invalid_field_returns_422(client, seed, field, val):
    resp = client.post("/ingestion/transactions", json={**TRANSACTION_PAYLOAD, field: val})
    assert resp.status_code == 422
    [err] = resp.json()["detail"]
    assert err["loc"] == ["body", field]
    assert not err["msg"].startswith("Linha")
    assert _nothing_saved(seed)


def test_transaction_with_non_finite_amount_returns_422(client, seed):
    raw_json = str(TRANSACTION_PAYLOAD).replace("'", '"').replace("1459.15", "NaN")
    resp = client.post(
        "/ingestion/transactions",
        content=raw_json,
        headers={"content-type": "application/json"},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "Amount"]
    assert _nothing_saved(seed)


# --- autoria, auditoria e rollback -----------------------------------------------------------


def test_ingestion_audits_with_local_analyst(client, db):
    assert _upload(client, _csv(ROW, ROW)).status_code == 201
    assert client.post("/ingestion/transactions", json=TRANSACTION_PAYLOAD).status_code == 201
    audits = _rows(db, "SELECT * FROM audit_log ORDER BY id")
    assert [(a["actor"], a["action"], a["entity"], a["entity_id"]) for a in audits] == [
        (LOCAL_USER.name, "ingestion", "ingestion", "1"),
        (LOCAL_USER.name, "ingestion", "ingestion", "2"),
    ]
    assert audits[0]["details"] == {
        "source": "csv",
        "row_count": 2,
        "file_name": "extrato.csv",
        "user_id": LOCAL_USER.id,
    }
    assert audits[1]["details"] == {
        "source": "manual",
        "row_count": 1,
        "user_id": LOCAL_USER.id,
    }


def test_ingestion_uses_authenticated_user(client, seed):
    user = User(id="analyst-42", name="Joana Revisora")
    client.app.dependency_overrides[get_current_user] = lambda: user
    try:
        assert _upload(client, _csv(ROW)).status_code == 201
    finally:
        client.app.dependency_overrides.pop(get_current_user)
    assert seed.row("SELECT created_by FROM ingestions")["created_by"] == user.name
    audit = seed.row("SELECT * FROM audit_log")
    assert audit["actor"] == user.name
    assert audit["details"]["user_id"] == user.id


@pytest.mark.parametrize("endpoint", ["csv", "transactions"])
def test_failure_after_copy_rolls_back_everything(client, seed, monkeypatch, endpoint):
    orig_audit = ingestion._audit

    def fail(*args, **kwargs):
        orig_audit(*args, **kwargs)
        raise RuntimeError("Falha de auditoria simulada")

    monkeypatch.setattr(ingestion, "_audit", fail)
    with pytest.raises(RuntimeError, match="Falha de auditoria simulada"):
        if endpoint == "csv":
            _upload(client, _csv(ROW, ROW))
        else:
            client.post("/ingestion/transactions", json=TRANSACTION_PAYLOAD)
    assert _nothing_saved(seed)
