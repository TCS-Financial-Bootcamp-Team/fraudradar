"""Validação das transações que entram pela ingestão: formato do SAML-D, sem os rótulos.

A API usa em POST /ingestion/csv e /ingestion/transactions; o worker vai usar na carga em lote.
As regras espelham o zod do front (web/src/features/ingestion/schemas/ingestion.ts), mas a
palavra final é esta:

- Date `AAAA-MM-DD` e Time `HH:MM` ou `HH:MM:SS` viram `occurred_at`, sem fuso;
- contas: só dígitos, sem zero à esquerda, até o maior BIGINT. A coluna é numérica: o zero à
  esquerda se perderia e "0123" viraria a mesma conta que "123";
- Amount: número finito, arredondado para centavos como faz a coluna NUMERIC(14,2), maior que
  zero. Está em libras qualquer que seja a moeda (AMOUNT_CURRENCY): nada é convertido;
- moedas, países e meio de pagamento: o texto como veio (sem espaços nas pontas), sem
  caracteres de controle, nos tamanhos do zod.

Tudo ou nada: quem grava só deve gravar se nenhuma linha tiver erro.
"""

import codecs
import csv
import re
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal
from typing import BinaryIO, NamedTuple

from fraudradar.data.schema import COLUMN_RENAMES, GROUND_TRUTH_COLUMNS, TRANSACTION_COLUMNS

MAX_ERRORS = 20
MAX_LINE_BYTES = 64 * 1024  # uma linha do SAML-D tem uns 100 bytes
MAX_ACCOUNT = 2**63 - 1  # BIGINT
MAX_AMOUNT = Decimal("999999999999.99")  # NUMERIC(14,2)

# [0-9] e não \d: em Python, \d aceita dígitos de outros alfabetos ("١٢٣").
_TIME_RE = re.compile(r"([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?")  # o mesmo padrão do zod
_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_ACCOUNT_RE = re.compile(r"[1-9][0-9]{0,18}")
_NUMBER_RE = re.compile(r"[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_CENT = Decimal("0.01")


class Transaction(NamedTuple):
    """Uma linha de `transactions`, com os campos na ordem das colunas."""

    occurred_at: datetime
    sender: int
    receiver: int
    amount: Decimal
    payment_currency: str
    received_currency: str
    sender_country: str
    receiver_country: str
    payment_type: str


@dataclass(frozen=True)
class ValidationError:
    line: int | None  # linha do arquivo, com o cabeçalho na linha 1; None fora de arquivo
    column: str | None  # None quando o erro é da linha toda
    message: str


class InvalidTransactionsError(ValueError):
    """Nada deve ser gravado. `errors` traz os primeiros problemas, na ordem do arquivo."""

    def __init__(self, errors: list[ValidationError]):
        super().__init__(" ".join(e.message for e in errors))
        self.errors = errors


class TooManyRowsError(ValueError):
    """O arquivo passa do limite de linhas pedido por quem chamou."""

    def __init__(self, limit: int):
        super().__init__(f"O arquivo passa de {limit} linhas.")
        self.limit = limit


# Cada conversor recusa o valor com ValueError e uma mensagem para o analista.


def _parse_time(value: str) -> time:
    if not _TIME_RE.fullmatch(value):
        raise ValueError("Use HH:MM ou HH:MM:SS, de 00:00 a 23:59:59.")
    return time.fromisoformat(value)


def _parse_date(value: str) -> date:
    if not _DATE_RE.fullmatch(value):
        raise ValueError("Use a data no formato AAAA-MM-DD.")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("Essa data não existe no calendário.") from None


def _parse_account(value: str) -> int:
    if not _ACCOUNT_RE.fullmatch(value):
        raise ValueError("Use só dígitos, sem zero à esquerda.")
    account = int(value)
    if account > MAX_ACCOUNT:
        raise ValueError(f"A conta passa do maior número aceito, {MAX_ACCOUNT}.")
    return account


def _parse_amount(raw: str | float) -> Decimal:
    # No JSON o valor chega como float; repr() devolve o número como foi escrito (1.005, e
    # não 1.00499...), então o arredondamento é o mesmo do CSV.
    text_val = raw if isinstance(raw, str) else repr(raw)
    if not _NUMBER_RE.fullmatch(text_val):
        raise ValueError("Use um número com ponto decimal, sem separador de milhar: 1459.15.")
    amount = Decimal(text_val)
    if amount <= 0:
        raise ValueError("O valor deve ser maior que zero.")
    if amount > MAX_AMOUNT:
        raise ValueError(f"O valor passa do máximo aceito, {MAX_AMOUNT}.")
    cents = amount.quantize(_CENT, ROUND_HALF_UP)
    if cents == 0:
        raise ValueError("O valor deve ser de pelo menos 0.01.")
    if cents > MAX_AMOUNT:  # 999999999999.995 arredonda para 1 trilhão
        raise ValueError(f"O valor passa do máximo aceito, {MAX_AMOUNT}.")
    return cents


def _text_validator(min_len: int, max_len: int, empty_msg: str) -> Callable[[str], str]:
    def validate(value: str) -> str:
        if not value:
            raise ValueError(empty_msg)
        if _CONTROL_CHARS_RE.search(value):
            raise ValueError("Tire quebras de linha, tabulações e outros caracteres de controle.")
        if not min_len <= len(value) <= max_len:
            raise ValueError(f"Use de {min_len} a {max_len} caracteres.")
        return value

    return validate


# Na ordem de TRANSACTION_COLUMNS; os tamanhos são os do zod.
_FIELDS: dict[str, Callable] = {
    "Time": _parse_time,
    "Date": _parse_date,
    "Sender_account": _parse_account,
    "Receiver_account": _parse_account,
    "Amount": _parse_amount,
    "Payment_currency": _text_validator(2, 40, "Informe a moeda."),
    "Received_currency": _text_validator(2, 40, "Informe a moeda."),
    "Sender_bank_location": _text_validator(2, 80, "Informe o país."),
    "Receiver_bank_location": _text_validator(2, 80, "Informe o país."),
    "Payment_type": _text_validator(2, 80, "Informe o meio de pagamento."),
}


def parse_transaction(record: Mapping[str, object], line: int | None = None) -> Transaction:
    """Valida os campos de TRANSACTION_COLUMNS (nomes do CSV) e devolve a linha de `transactions`.

    Levanta InvalidTransactionsError com um ValidationError por campo recusado, marcados com `line`.
    """
    values: dict[str, object] = {}
    errors: list[ValidationError] = []
    for column, validate in _FIELDS.items():
        raw = record[column]
        try:
            values[column] = validate(raw.strip() if isinstance(raw, str) else raw)
        except ValueError as exc:
            errors.append(ValidationError(line, column, str(exc)))
    if errors:
        raise InvalidTransactionsError(errors)
    return Transaction(
        occurred_at=datetime.combine(values.pop("Date"), values.pop("Time")),
        **{COLUMN_RENAMES[column]: value for column, value in values.items()},
    )


def _utf8_lines(file: BinaryIO) -> Iterator[str]:
    """Decodifica uma linha por vez, para o erro de UTF-8 apontar a linha certa."""
    line_num = 0
    while raw_line := file.readline(MAX_LINE_BYTES + 1):
        line_num += 1
        if len(raw_line) > MAX_LINE_BYTES:
            message = f"Linha com mais de {MAX_LINE_BYTES // 1024} KiB."
            raise InvalidTransactionsError([ValidationError(line_num, None, message)])
        if line_num == 1:
            raw_line = raw_line.removeprefix(codecs.BOM_UTF8)
        try:
            decoded = raw_line.decode("utf-8")
        except UnicodeDecodeError:
            message = "Linha fora do UTF-8: salve o CSV como UTF-8."
            raise InvalidTransactionsError([ValidationError(line_num, None, message)]) from None
        yield decoded


def _column_positions(header: list[str]) -> dict[str, int]:
    """Coluna -> posição na linha. Qualquer ordem vale; todas de TRANSACTION_COLUMNS, sem sobras."""
    names = [name.strip() for name in header]
    errors = [
        ValidationError(1, name, "Rótulo de avaliação não entra pela API: remova a coluna.")
        for name in names
        if name in GROUND_TRUTH_COLUMNS
    ]
    errors += [
        ValidationError(1, c, "Coluna obrigatória ausente.")
        for c in TRANSACTION_COLUMNS
        if c not in names
    ]
    errors += [
        ValidationError(1, c, "Coluna repetida.") for c in TRANSACTION_COLUMNS if names.count(c) > 1
    ]
    errors += [
        ValidationError(
            1, name or None, "Coluna desconhecida: use só as colunas de transação do SAML-D."
        )
        for name in names
        if name not in TRANSACTION_COLUMNS and name not in GROUND_TRUTH_COLUMNS
    ]
    if errors:
        raise InvalidTransactionsError(errors)
    return {column: names.index(column) for column in TRANSACTION_COLUMNS}


def read_csv(
    file: BinaryIO, *, max_rows: int | None = None, max_errors: int = MAX_ERRORS
) -> Iterator[Transaction]:
    """Lê um CSV do SAML-D sem rótulos (UTF-8, vírgula), validando todas as linhas.

    Linha 1 é o cabeçalho, com as colunas de TRANSACTION_COLUMNS em qualquer ordem; linhas em
    branco são puladas. Entrega as transações na ordem do arquivo; no primeiro erro, para de
    entregar e segue validando até juntar `max_errors`, e então levanta InvalidTransactionsError.
    Por isso, valide o arquivo inteiro antes de gravar ou grave numa transação do banco.
    Levanta TooManyRowsError assim que passa de `max_rows`.
    """
    reader = csv.reader(_utf8_lines(file))
    errors: list[ValidationError] = []
    total = 0
    try:
        header = next(reader, None)
        if header is None:
            raise InvalidTransactionsError([ValidationError(None, None, "O arquivo está vazio.")])
        positions = _column_positions(header)
        for fields in reader:
            if not any(field.strip() for field in fields):
                continue
            total += 1
            if max_rows is not None and total > max_rows:
                raise TooManyRowsError(max_rows)
            if len(fields) != len(header):
                message = f"A linha tem {len(fields)} campo(s), e o cabeçalho, {len(header)}."
                errors.append(ValidationError(reader.line_num, None, message))
            else:
                record = {column: fields[i] for column, i in positions.items()}
                try:
                    parsed = parse_transaction(record, reader.line_num)
                except InvalidTransactionsError as exc:
                    errors += exc.errors
                else:
                    if not errors:
                        yield parsed
            if len(errors) >= max_errors:
                break
    except InvalidTransactionsError as exc:  # arquivo vazio, cabeçalho ruim ou linha ilegível
        errors += exc.errors
    except csv.Error:
        errors.append(ValidationError(reader.line_num, None, "CSV malformado: confira as aspas."))
    if errors:
        raise InvalidTransactionsError(errors[:max_errors])
    if total == 0:
        raise InvalidTransactionsError(
            [ValidationError(None, None, "O CSV não tem transações, só o cabeçalho.")]
        )
