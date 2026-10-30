"""Validação da ingestão (fraudradar.data.ingestion), sem banco."""

import io
from datetime import datetime
from decimal import Decimal

import pytest

from fraudradar.data import ingestion
from fraudradar.data.ingestion import (
    InvalidTransactionsError,
    TooManyRowsError,
    Transaction,
    ValidationError,
)
from fraudradar.data.schema import COLUMN_RENAMES, TRANSACTION_COLUMNS

HEADER = ",".join(TRANSACTION_COLUMNS)
ROW = "10:35:19,2022-10-07,8724731955,2769355426,1459.15,UK pounds,Euro,UK,France,Cross-border"
EXPECTED = Transaction(
    occurred_at=datetime(2022, 10, 7, 10, 35, 19),
    sender=8724731955,
    receiver=2769355426,
    amount=Decimal("1459.15"),
    payment_currency="UK pounds",
    received_currency="Euro",
    sender_country="UK",
    receiver_country="France",
    payment_type="Cross-border",
)


def _file(*rows: str, header: str = HEADER) -> io.BytesIO:
    return io.BytesIO("\n".join([header, *rows, ""]).encode())


def _with_field(column: str, value: str) -> str:
    """ROW com o campo `column` trocado por `value`."""
    fields = ROW.split(",")
    fields[TRANSACTION_COLUMNS.index(column)] = value
    return ",".join(fields)


def _errors(file: io.BytesIO, **options) -> list[ValidationError]:
    with pytest.raises(InvalidTransactionsError) as exc:
        list(ingestion.read_csv(file, **options))
    return exc.value.errors


def test_transaction_matches_table_columns():
    assert TRANSACTION_COLUMNS[:2] == ["Time", "Date"]
    assert Transaction._fields == (
        "occurred_at",
        *(COLUMN_RENAMES[c] for c in TRANSACTION_COLUMNS[2:]),
    )


def test_reads_valid_csv():
    assert list(ingestion.read_csv(_file(ROW, ROW))) == [EXPECTED, EXPECTED]


def test_accepts_columns_in_any_order_bom_crlf_and_blank_lines():
    header = ", ".join(reversed(TRANSACTION_COLUMNS))
    row = ",".join(reversed(ROW.split(",")))
    content = f"\ufeff{header}\r\n\r\n{row}\r\n , ,\r\n{row}\r\n".encode()
    assert list(ingestion.read_csv(io.BytesIO(content))) == [EXPECTED, EXPECTED]


@pytest.mark.parametrize(
    ("column", "value", "field", "expected"),
    [
        ("Time", "10:35", "occurred_at", datetime(2022, 10, 7, 10, 35)),
        ("Time", "23:59:59", "occurred_at", datetime(2022, 10, 7, 23, 59, 59)),
        ("Date", "2024-02-29", "occurred_at", datetime(2024, 2, 29, 10, 35, 19)),
        ("Sender_account", "1", "sender", 1),
        ("Sender_account", "9223372036854775807", "sender", 2**63 - 1),
        ("Receiver_account", " 42 ", "receiver", 42),
        ("Amount", "0.01", "amount", Decimal("0.01")),
        ("Amount", "1459.155", "amount", Decimal("1459.16")),  # arredonda como NUMERIC(14,2)
        ("Amount", "1e3", "amount", Decimal("1000.00")),
        ("Amount", "999999999999.99", "amount", Decimal("999999999999.99")),
        ("Payment_currency", "  Naira ", "payment_currency", "Naira"),
        ("Payment_type", "ACH", "payment_type", "ACH"),
    ],
)
def test_converts_valid_field(column, value, field, expected):
    [tx] = ingestion.read_csv(_file(_with_field(column, value)))
    assert getattr(tx, field) == expected


@pytest.mark.parametrize(
    ("column", "value", "message"),
    [
        ("Time", "24:00", "HH:MM"),
        ("Time", "9:30", "HH:MM"),
        ("Time", "10:35:19.5", "HH:MM"),
        ("Date", "07/10/2022", "AAAA-MM-DD"),
        ("Date", "20221007", "AAAA-MM-DD"),
        ("Date", "2023-02-29", "não existe"),
        ("Sender_account", "ACC-123", "só dígitos"),
        ("Sender_account", "0123", "zero à esquerda"),
        ("Sender_account", "0", "só dígitos"),
        ("Sender_account", "-5", "só dígitos"),
        ("Sender_account", "١٢٣", "só dígitos"),  # dígitos de outro alfabeto
        ("Receiver_account", "9223372036854775808", "maior número"),
        ("Receiver_account", "", "só dígitos"),
        ("Amount", "0", "maior que zero"),
        ("Amount", "-10.50", "maior que zero"),
        ("Amount", "0.004", "pelo menos 0.01"),
        ("Amount", '"1,5"', "ponto decimal"),  # vírgula decimal, entre aspas como no Excel
        ("Amount", "NaN", "ponto decimal"),
        ("Amount", "Infinity", "ponto decimal"),
        ("Amount", "1000000000000", "máximo"),
        ("Amount", "999999999999.995", "máximo"),
        ("Payment_currency", "", "Informe a moeda"),
        ("Received_currency", "X", "de 2 a 40"),
        ("Sender_bank_location", "U" * 81, "de 2 a 80"),
        ("Payment_type", "Cash\tDeposit", "caracteres de controle"),
    ],
)
def test_rejects_invalid_field_with_line_and_column(column, value, message):
    [err] = _errors(_file(ROW, _with_field(column, value)))
    assert (err.line, err.column) == (3, column)
    assert message in err.message


@pytest.mark.parametrize(
    "labels", [["Is_laundering"], ["Laundering_type"], ["Is_laundering", "Laundering_type"]]
)
def test_rejects_ground_truth_columns(labels):
    values = {"Is_laundering": "1", "Laundering_type": "Structuring"}
    header = ",".join([*TRANSACTION_COLUMNS, *labels])
    errors = _errors(_file(",".join([ROW, *(values[k] for k in labels)]), header=header))
    assert [(e.line, e.column) for e in errors] == [(1, k) for k in labels]
    assert all("Rótulo de avaliação" in e.message for e in errors)


def test_header_with_missing_duplicate_or_unknown_column():
    header = HEADER.replace("Amount", "Time") + ",Channel,"
    errors = _errors(_file(ROW + ",x,", header=header))
    unknown = "Coluna desconhecida: use só as colunas de transação do SAML-D."
    assert [(e.line, e.column, e.message) for e in errors] == [
        (1, "Amount", "Coluna obrigatória ausente."),
        (1, "Time", "Coluna repetida."),
        (1, "Channel", unknown),
        (1, None, unknown),
    ]


@pytest.mark.parametrize("row", [ROW + ",extra", ROW.rsplit(",", 1)[0]])
def test_row_with_too_many_or_too_few_fields(row):
    [err] = _errors(_file(row))
    assert (err.line, err.column) == (2, None)
    assert "cabeçalho" in err.message


def test_collects_up_to_max_errors_and_stops_reading():
    file = _file(*[_with_field("Time", "99:99")] * 30)
    errors = _errors(file)
    assert [e.line for e in errors] == list(range(2, 2 + ingestion.MAX_ERRORS))
    assert file.tell() < len(file.getvalue())
    assert len(_errors(_file(*[_with_field("Time", "99:99")] * 30), max_errors=3)) == 3


def test_stops_yielding_rows_at_first_error():
    reader = ingestion.read_csv(_file(ROW, _with_field("Amount", "0"), ROW))
    assert next(reader) == EXPECTED
    with pytest.raises(InvalidTransactionsError) as exc:
        next(reader)
    assert [e.line for e in exc.value.errors] == [3]


@pytest.mark.parametrize(
    ("content", "message"), [(b"", "vazio"), (HEADER.encode() + b"\n\n", "só o cabeçalho")]
)
def test_file_without_transactions(content, message):
    [err] = _errors(io.BytesIO(content))
    assert (err.line, err.column) == (None, None)
    assert message in err.message


def test_too_many_rows_stops_immediately_above_limit():
    file = _file(*[ROW] * 5)
    with pytest.raises(TooManyRowsError) as exc:
        list(ingestion.read_csv(file, max_rows=3))
    assert exc.value.limit == 3
    assert file.tell() < len(file.getvalue())
    assert list(ingestion.read_csv(_file(*[ROW] * 3), max_rows=3)) == [EXPECTED] * 3


def test_invalid_utf8_points_to_line():
    content = _file(ROW).getvalue() + "Ação".encode("latin-1") + b"\n"
    [err] = _errors(io.BytesIO(content))
    assert (err.line, err.column) == (3, None)
    assert "UTF-8" in err.message


def test_line_too_long():
    [err] = _errors(_file(ROW, "x" * (ingestion.MAX_LINE_BYTES + 1)))
    assert err.line == 3
    assert "KiB" in err.message


def test_unclosed_quoted_field_becomes_csv_error():
    unclosed = '"' + ("a" * 1000 + "\n") * 200  # um campo de 200 KB: passa do limite do csv
    errors = _errors(_file(ROW, unclosed))
    assert errors[-1].message == "CSV malformado: confira as aspas."


def test_json_transaction_uses_same_rules():
    record = dict(zip(TRANSACTION_COLUMNS, ROW.split(","), strict=True))
    assert ingestion.parse_transaction({**record, "Amount": 1459.15}) == EXPECTED
    # O float do JSON arredonda como o texto do CSV (1.005 vira 1.01, não 1.00).
    assert ingestion.parse_transaction({**record, "Amount": 1.005}).amount == Decimal("1.01")
    assert ingestion.parse_transaction({**record, "Amount": 0.1 + 0.2}).amount == Decimal("0.30")
    with pytest.raises(InvalidTransactionsError) as exc:
        ingestion.parse_transaction({**record, "Amount": float("inf"), "Sender_account": "x"})
    assert [(e.line, e.column) for e in exc.value.errors] == [
        (None, "Sender_account"),
        (None, "Amount"),
    ]
