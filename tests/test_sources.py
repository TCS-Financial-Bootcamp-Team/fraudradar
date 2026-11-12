"""Fontes externas sem banco: cifra, hosts liberados, identificadores e regras de relação."""

from datetime import date, datetime, time
from decimal import Decimal

import psycopg
import pytest
from cryptography.fernet import Fernet
from external_source import configure, make_rows

from fraudradar.config import get_settings
from fraudradar.data.ingestion import InvalidTransactionsError
from fraudradar.sources import compatibility, reader
from fraudradar.sources.compatibility import DatasetRange
from fraudradar.sources.connection import (
    ExternalSource,
    HostNotAllowedError,
    InvalidIdentifierError,
    SourceError,
    check_host,
    check_port,
    describe_error,
    relation_identifier,
    split_relation,
    validate_identifier,
)
from fraudradar.sources.crypto import (
    CannotDecryptError,
    SecretKeyMissingError,
    decrypt_password,
    encrypt_password,
)

# --- cifra -----------------------------------------------------------------------------------


def test_password_round_trip_never_stores_plain_text(monkeypatch):
    configure(monkeypatch)
    token = encrypt_password("s3nh@-secreta")
    assert "s3nh@-secreta" not in token
    assert decrypt_password(token) == "s3nh@-secreta"


def test_missing_or_invalid_key_refuses_to_encrypt(monkeypatch):
    monkeypatch.setenv("CONNECTIONS_SECRET_KEY", "")
    get_settings.cache_clear()
    with pytest.raises(SecretKeyMissingError, match="CONNECTIONS_SECRET_KEY"):
        encrypt_password("x")
    monkeypatch.setenv("CONNECTIONS_SECRET_KEY", "isto-nao-e-fernet")
    get_settings.cache_clear()
    with pytest.raises(SecretKeyMissingError, match="inválida"):
        encrypt_password("x")


def test_changed_key_cannot_decrypt_and_error_hides_the_secret(monkeypatch):
    configure(monkeypatch)
    token = encrypt_password("senha-muito-secreta")
    monkeypatch.setenv("CONNECTIONS_SECRET_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()
    with pytest.raises(CannotDecryptError) as error:
        decrypt_password(token)
    assert "senha-muito-secreta" not in str(error.value)


def test_source_repr_hides_the_password():
    source = ExternalSource("h", 5432, "db", "u", "senha-no-repr", "t")
    assert "senha-no-repr" not in repr(source)


@pytest.mark.parametrize("password", ["", "segredo"])
def test_describe_error_classifies_auth_failures_with_or_without_a_password(password):
    source = ExternalSource("h", 5432, "db", "u", password, "t")
    failure = psycopg.OperationalError(
        f'FATAL: password authentication failed for user "u" ({password})'
    )
    # Com senha vazia, ``replace("", "***")`` enfiaria *** entre as letras e escondia a causa.
    assert describe_error(failure, source) == "Usuário ou senha recusados pelo servidor."


# --- hosts e portas ----------------------------------------------------------------------------


def test_empty_allow_list_refuses_every_host(monkeypatch):
    monkeypatch.setenv("EXTERNAL_DB_ALLOWED_HOSTS", "")
    get_settings.cache_clear()
    with pytest.raises(HostNotAllowedError, match="EXTERNAL_DB_ALLOWED_HOSTS"):
        check_host("localhost")


def test_allowed_hosts_are_exact_and_case_insensitive(monkeypatch):
    monkeypatch.setenv("EXTERNAL_DB_ALLOWED_HOSTS", " LocalHost , 127.0.0.1,host.docker.internal")
    get_settings.cache_clear()
    assert check_host("localhost") == "localhost"
    assert check_host(" HOST.docker.internal ") == "host.docker.internal"
    for denied in ("169.254.169.254", "localhost.evil.com", "db.interno", "127.0.0.2"):
        with pytest.raises(HostNotAllowedError):
            check_host(denied)


@pytest.mark.parametrize("host", ["", "   ", "a b", "x/y", "localhost;ls", "http://localhost"])
def test_malformed_hosts_are_refused_even_if_listed(monkeypatch, host):
    monkeypatch.setenv("EXTERNAL_DB_ALLOWED_HOSTS", host or "localhost")
    get_settings.cache_clear()
    with pytest.raises(HostNotAllowedError):
        check_host(host)


@pytest.mark.parametrize("port", [0, -1, 65536, True])
def test_invalid_ports_are_refused(port):
    with pytest.raises(SourceError):
        check_port(port)


# --- identificadores ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "table,expected",
    [("saml", (None, "saml")), ("public.Saml_D", ("public", "Saml_D")), ("_t1", (None, "_t1"))],
)
def test_valid_relations(table, expected):
    assert split_relation(table) == expected


@pytest.mark.parametrize(
    "attack",
    [
        "saml; DROP TABLE users",
        "saml--",
        'saml"',
        '"saml"',
        "a.b.c",
        "public.",
        ".saml",
        "saml WHERE 1=1",
        "saml/**/",
        "1abc",
        "",
        "sa ml",
        "saml\nselect 1",
        "x" * 64,
        "tabela-com-hifen",
        "ação",
    ],
)
def test_injection_attempts_in_table_and_column_are_refused(attack):
    with pytest.raises(InvalidIdentifierError):
        split_relation(attack)
    with pytest.raises(InvalidIdentifierError):
        validate_identifier(attack)


def test_relation_is_quoted_when_rendered():
    assert relation_identifier("public.Saml").as_string() == '"public"."Saml"'
    assert relation_identifier("saml").as_string() == '"saml"'


# --- conversão e validação das linhas ------------------------------------------------------------


def _info(truth: bool = True) -> reader.TableInfo:
    names = [c for c in reader.SOURCE_COLUMNS if truth or not c.startswith(("Is_", "Laun"))]
    return reader.TableInfo(
        columns={c: reader.SourceColumn(c, "text") for c in names}, control=None, exists=True
    )


def test_native_values_are_normalized_to_the_csv_format():
    row = make_rows(1)[0] | {
        "Time": time(9, 5, 7, 123),
        "Date": datetime(2023, 9, 4, 0, 0),
        "Sender_account": Decimal("123456"),
        "Amount": 12.5,
    }
    record = reader.to_record(_info(), row)
    assert record["Time"] == "09:05:07"
    assert record["Date"] == "2023-09-04"
    assert record["Sender_account"] == "123456"
    assert record["Amount"] == "12.5"


def test_rows_are_validated_with_the_csv_validators_and_truth_is_split():
    rows = make_rows(3)
    transactions, truth = reader.parse_rows(_info(), rows, first_line=2)
    assert len(transactions) == 3 and transactions[0].sender == 9001
    assert truth == [
        (1, "Fan-out", "fan_out"),
        (0, "Normal_Small_Fan_Out", "normal_small_fan_out"),
        (0, "Normal_Small_Fan_Out", "normal_small_fan_out"),
    ]
    _, no_truth = reader.parse_rows(_info(truth=False), rows, first_line=2)
    assert no_truth is None


def test_invalid_rows_report_line_and_column_without_the_value():
    rows = make_rows(3)
    rows[1]["Sender_account"] = "0123"
    rows[2]["Is_laundering"] = 7
    with pytest.raises(InvalidTransactionsError) as error:
        reader.parse_rows(_info(), rows, first_line=10)
    lines = {(e.line, e.column) for e in error.value.errors}
    assert (11, "Sender_account") in lines and (12, "Is_laundering") in lines


# --- relação com o conjunto atual ----------------------------------------------------------


CURRENT = DatasetRange(date(2023, 1, 2), date(2023, 6, 14))  # semana aberta: segunda 12/06


@pytest.mark.parametrize(
    "first,last,expected",
    [
        (date(2023, 6, 15), date(2023, 7, 1), "continue"),
        (date(2023, 6, 10), date(2023, 7, 1), "overlap"),
        (date(2022, 1, 1), date(2022, 2, 1), "other_era"),
        (date(2024, 3, 1), date(2024, 4, 1), "other_era"),
        (None, None, "unknown"),
    ],
)
def test_dates_relation(first, last, expected):
    assert compatibility.classify_dates(first, last, CURRENT) == expected


def test_dates_relation_with_empty_dataset():
    empty = DatasetRange(None, None)
    assert (
        compatibility.classify_dates(date(2023, 1, 1), date(2023, 2, 1), empty) == "empty_dataset"
    )


def test_closed_weeks_are_everything_before_the_monday_of_the_last_transaction():
    assert compatibility.closed_weeks_conflict(date(2023, 6, 11), CURRENT) is True
    assert compatibility.closed_weeks_conflict(date(2023, 6, 12), CURRENT) is False
    assert compatibility.closed_weeks_conflict(date(2023, 6, 20), CURRENT) is False
    assert compatibility.closed_weeks_conflict(None, CURRENT) is False
    assert compatibility.closed_weeks_conflict(date(2020, 1, 1), DatasetRange(None, None)) is False


def _overlap(pct, dates):
    return {"known_accounts_pct": pct, "dates": dates}


def test_suggestions_never_decide_and_follow_the_signals():
    ext = compatibility.suggest(True, _overlap(80.0, "continue"), True)
    assert ext["relation"] == "extend"
    assert compatibility.suggest(True, _overlap(80.0, "overlap"), True)["relation"] == "new_dataset"
    assert compatibility.suggest(True, _overlap(2.0, "continue"), True)["relation"] == "new_dataset"
    assert compatibility.suggest(True, _overlap(40.0, "continue"), True)["relation"] is None
    assert compatibility.suggest(False, None, False)["relation"] is None
    assert compatibility.suggest(True, _overlap(None, "empty_dataset"), True)["relation"] is None


def test_a_copy_of_the_loaded_base_is_called_out_as_a_suggestion():
    copy = compatibility.suggest(True, _overlap(100.0, "overlap"), True)
    # Só pré-seleciona (continuar seria recusado): quem decide é a pessoa.
    assert copy["relation"] == "new_dataset"
    assert "parece ser a mesma base já carregada" in copy["message"]
    assert "importar duplicaria transações" in copy["message"]
    assert "mesma base" in compatibility.suggest(True, _overlap(99.5, "overlap"), True)["message"]
    # Contas em comum, mas não quase todas, ou datas que continuam: não é uma cópia.
    partial = compatibility.suggest(True, _overlap(80.0, "overlap"), True)
    assert "mesma base" not in partial["message"]
    assert compatibility.suggest(True, _overlap(100.0, "continue"), True)["relation"] == "extend"
