"""Validação das transações que entram pela ingestão: formato do SAML-D, sem os rótulos.

A API usa em POST /ingestao/csv e /ingestao/transacoes; o worker vai usar na carga em lote.
As regras espelham o zod do front (web/src/features/ingestao/schemas/ingestao.ts), mas a
palavra final é esta:

- Date `AAAA-MM-DD` e Time `HH:MM` ou `HH:MM:SS` viram `data_hora`, sem fuso;
- contas: só dígitos, sem zero à esquerda, até o maior BIGINT. A coluna é numérica: o zero à
  esquerda se perderia e "0123" viraria a mesma conta que "123";
- Amount: número finito, arredondado para centavos como faz a coluna NUMERIC(14,2), maior que
  zero. Está em libras qualquer que seja a moeda (MOEDA_DOS_VALORES): nada é convertido;
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

from fraudradar.dados.schema import COLUNAS_AVALIACAO, COLUNAS_TRANSACAO, RENOMEAR

MAX_ERROS = 20
MAX_BYTES_LINHA = 64 * 1024  # uma linha do SAML-D tem uns 100 bytes
CONTA_MAXIMA = 2**63 - 1  # BIGINT
VALOR_MAXIMO = Decimal("999999999999.99")  # NUMERIC(14,2)

# [0-9] e não \d: em Python, \d aceita dígitos de outros alfabetos ("١٢٣").
_HORA = re.compile(r"([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?")  # o mesmo padrão do zod
_DATA = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_CONTA = re.compile(r"[1-9][0-9]{0,18}")
_NUMERO = re.compile(r"[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?")
_CONTROLE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_CENTAVO = Decimal("0.01")


class Transacao(NamedTuple):
    """Uma linha de `transacoes`, com os campos na ordem das colunas."""

    data_hora: datetime
    remetente: int
    recebedor: int
    valor: Decimal
    moeda_pagamento: str
    moeda_recebida: str
    pais_remetente: str
    pais_recebedor: str
    tipo_pagamento: str


@dataclass(frozen=True)
class Erro:
    linha: int | None  # linha do arquivo, com o cabeçalho na linha 1; None fora de arquivo
    coluna: str | None  # None quando o erro é da linha toda
    mensagem: str


class TransacoesInvalidas(ValueError):  # noqa: N818 - nome de domínio, em português
    """Nada deve ser gravado. `erros` traz os primeiros problemas, na ordem do arquivo."""

    def __init__(self, erros: list[Erro]):
        super().__init__(" ".join(e.mensagem for e in erros))
        self.erros = erros


class LinhasDemais(ValueError):  # noqa: N818 - nome de domínio, em português
    """O arquivo passa do limite de linhas pedido por quem chamou."""

    def __init__(self, limite: int):
        super().__init__(f"O arquivo passa de {limite} linhas.")
        self.limite = limite


# Cada conversor recusa o valor com ValueError e uma mensagem para o analista.


def _hora(texto: str) -> time:
    if not _HORA.fullmatch(texto):
        raise ValueError("Use HH:MM ou HH:MM:SS, de 00:00 a 23:59:59.")
    return time.fromisoformat(texto)


def _data(texto: str) -> date:
    if not _DATA.fullmatch(texto):
        raise ValueError("Use a data no formato AAAA-MM-DD.")
    try:
        return date.fromisoformat(texto)
    except ValueError:
        raise ValueError("Essa data não existe no calendário.") from None


def _conta(texto: str) -> int:
    if not _CONTA.fullmatch(texto):
        raise ValueError("Use só dígitos, sem zero à esquerda.")
    conta = int(texto)
    if conta > CONTA_MAXIMA:
        raise ValueError(f"A conta passa do maior número aceito, {CONTA_MAXIMA}.")
    return conta


def _valor(bruto: str | float) -> Decimal:
    # No JSON o valor chega como float; repr() devolve o número como foi escrito (1.005, e
    # não 1.00499...), então o arredondamento é o mesmo do CSV.
    texto = bruto if isinstance(bruto, str) else repr(bruto)
    if not _NUMERO.fullmatch(texto):
        raise ValueError("Use um número com ponto decimal, sem separador de milhar: 1459.15.")
    valor = Decimal(texto)
    if valor <= 0:
        raise ValueError("O valor deve ser maior que zero.")
    if valor > VALOR_MAXIMO:
        raise ValueError(f"O valor passa do máximo aceito, {VALOR_MAXIMO}.")
    centavos = valor.quantize(_CENTAVO, ROUND_HALF_UP)
    if centavos == 0:
        raise ValueError("O valor deve ser de pelo menos 0.01.")
    if centavos > VALOR_MAXIMO:  # 999999999999.995 arredonda para 1 trilhão
        raise ValueError(f"O valor passa do máximo aceito, {VALOR_MAXIMO}.")
    return centavos


def _texto(minimo: int, maximo: int, vazio: str) -> Callable[[str], str]:
    def validar(texto: str) -> str:
        if not texto:
            raise ValueError(vazio)
        if _CONTROLE.search(texto):
            raise ValueError("Tire quebras de linha, tabulações e outros caracteres de controle.")
        if not minimo <= len(texto) <= maximo:
            raise ValueError(f"Use de {minimo} a {maximo} caracteres.")
        return texto

    return validar


# Na ordem de COLUNAS_TRANSACAO; os tamanhos são os do zod.
_CAMPOS: dict[str, Callable] = {
    "Time": _hora,
    "Date": _data,
    "Sender_account": _conta,
    "Receiver_account": _conta,
    "Amount": _valor,
    "Payment_currency": _texto(2, 40, "Informe a moeda."),
    "Received_currency": _texto(2, 40, "Informe a moeda."),
    "Sender_bank_location": _texto(2, 80, "Informe o país."),
    "Receiver_bank_location": _texto(2, 80, "Informe o país."),
    "Payment_type": _texto(2, 80, "Informe o meio de pagamento."),
}


def transacao(registro: Mapping[str, object], linha: int | None = None) -> Transacao:
    """Valida os campos de COLUNAS_TRANSACAO (nomes do CSV) e devolve a linha de `transacoes`.

    Levanta TransacoesInvalidas com um Erro por campo recusado, marcados com `linha`.
    """
    valores: dict[str, object] = {}
    erros: list[Erro] = []
    for coluna, validar in _CAMPOS.items():
        bruto = registro[coluna]
        try:
            valores[coluna] = validar(bruto.strip() if isinstance(bruto, str) else bruto)
        except ValueError as exc:
            erros.append(Erro(linha, coluna, str(exc)))
    if erros:
        raise TransacoesInvalidas(erros)
    return Transacao(
        data_hora=datetime.combine(valores.pop("Date"), valores.pop("Time")),
        **{RENOMEAR[coluna]: valor for coluna, valor in valores.items()},
    )


def _linhas_utf8(arquivo: BinaryIO) -> Iterator[str]:
    """Decodifica uma linha por vez, para o erro de UTF-8 apontar a linha certa."""
    numero = 0
    while bruta := arquivo.readline(MAX_BYTES_LINHA + 1):
        numero += 1
        if len(bruta) > MAX_BYTES_LINHA:
            mensagem = f"Linha com mais de {MAX_BYTES_LINHA // 1024} KiB."
            raise TransacoesInvalidas([Erro(numero, None, mensagem)])
        if numero == 1:
            bruta = bruta.removeprefix(codecs.BOM_UTF8)
        try:
            texto = bruta.decode("utf-8")
        except UnicodeDecodeError:
            mensagem = "Linha fora do UTF-8: salve o CSV como UTF-8."
            raise TransacoesInvalidas([Erro(numero, None, mensagem)]) from None
        yield texto


def _posicoes(cabecalho: list[str]) -> dict[str, int]:
    """Coluna -> posição na linha. Qualquer ordem vale; todas de COLUNAS_TRANSACAO, sem sobras."""
    nomes = [nome.strip() for nome in cabecalho]
    erros = [
        Erro(1, nome, "Rótulo de avaliação não entra pela API: remova a coluna.")
        for nome in nomes
        if nome in COLUNAS_AVALIACAO
    ]
    erros += [
        Erro(1, c, "Coluna obrigatória ausente.") for c in COLUNAS_TRANSACAO if c not in nomes
    ]
    erros += [Erro(1, c, "Coluna repetida.") for c in COLUNAS_TRANSACAO if nomes.count(c) > 1]
    erros += [
        Erro(1, nome or None, "Coluna desconhecida: use só as colunas de transação do SAML-D.")
        for nome in nomes
        if nome not in COLUNAS_TRANSACAO and nome not in COLUNAS_AVALIACAO
    ]
    if erros:
        raise TransacoesInvalidas(erros)
    return {coluna: nomes.index(coluna) for coluna in COLUNAS_TRANSACAO}


def ler_csv(
    arquivo: BinaryIO, *, max_linhas: int | None = None, max_erros: int = MAX_ERROS
) -> Iterator[Transacao]:
    """Lê um CSV do SAML-D sem rótulos (UTF-8, vírgula), validando todas as linhas.

    Linha 1 é o cabeçalho, com as colunas de COLUNAS_TRANSACAO em qualquer ordem; linhas em
    branco são puladas. Entrega as transações na ordem do arquivo; no primeiro erro, para de
    entregar e segue validando até juntar `max_erros`, e então levanta TransacoesInvalidas.
    Por isso, valide o arquivo inteiro antes de gravar ou grave numa transação do banco.
    Levanta LinhasDemais assim que passa de `max_linhas`.
    """
    leitor = csv.reader(_linhas_utf8(arquivo))
    erros: list[Erro] = []
    total = 0
    try:
        cabecalho = next(leitor, None)
        if cabecalho is None:
            raise TransacoesInvalidas([Erro(None, None, "O arquivo está vazio.")])
        posicoes = _posicoes(cabecalho)
        for campos in leitor:
            if not any(campo.strip() for campo in campos):
                continue
            total += 1
            if max_linhas is not None and total > max_linhas:
                raise LinhasDemais(max_linhas)
            if len(campos) != len(cabecalho):
                mensagem = f"A linha tem {len(campos)} campo(s), e o cabeçalho, {len(cabecalho)}."
                erros.append(Erro(leitor.line_num, None, mensagem))
            else:
                registro = {coluna: campos[i] for coluna, i in posicoes.items()}
                try:
                    lida = transacao(registro, leitor.line_num)
                except TransacoesInvalidas as exc:
                    erros += exc.erros
                else:
                    if not erros:
                        yield lida
            if len(erros) >= max_erros:
                break
    except TransacoesInvalidas as exc:  # arquivo vazio, cabeçalho ruim ou linha ilegível
        erros += exc.erros
    except csv.Error:
        erros.append(Erro(leitor.line_num, None, "CSV malformado: confira as aspas."))
    if erros:
        raise TransacoesInvalidas(erros[:max_erros])
    if total == 0:
        raise TransacoesInvalidas([Erro(None, None, "O CSV não tem transações, só o cabeçalho.")])
