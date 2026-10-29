"""Validação da ingestão (fraudradar.dados.ingestao), sem banco."""

import io
from datetime import datetime
from decimal import Decimal

import pytest

from fraudradar.dados import ingestao
from fraudradar.dados.ingestao import Erro, LinhasDemais, Transacao, TransacoesInvalidas
from fraudradar.dados.schema import COLUNAS_TRANSACAO, RENOMEAR

CABECALHO = ",".join(COLUNAS_TRANSACAO)
LINHA = "10:35:19,2022-10-07,8724731955,2769355426,1459.15,UK pounds,Euro,UK,France,Cross-border"
ESPERADA = Transacao(
    data_hora=datetime(2022, 10, 7, 10, 35, 19),
    remetente=8724731955,
    recebedor=2769355426,
    valor=Decimal("1459.15"),
    moeda_pagamento="UK pounds",
    moeda_recebida="Euro",
    pais_remetente="UK",
    pais_recebedor="France",
    tipo_pagamento="Cross-border",
)


def _arquivo(*linhas: str, cabecalho: str = CABECALHO) -> io.BytesIO:
    return io.BytesIO("\n".join([cabecalho, *linhas, ""]).encode())


def _com(coluna: str, valor: str) -> str:
    """LINHA com o campo `coluna` trocado por `valor`."""
    campos = LINHA.split(",")
    campos[COLUNAS_TRANSACAO.index(coluna)] = valor
    return ",".join(campos)


def _erros(arquivo: io.BytesIO, **opcoes) -> list[Erro]:
    with pytest.raises(TransacoesInvalidas) as exc:
        list(ingestao.ler_csv(arquivo, **opcoes))
    return exc.value.erros


def test_transacao_segue_as_colunas_da_tabela():
    assert COLUNAS_TRANSACAO[:2] == ["Time", "Date"]
    assert Transacao._fields == ("data_hora", *(RENOMEAR[c] for c in COLUNAS_TRANSACAO[2:]))


def test_le_csv_valido():
    assert list(ingestao.ler_csv(_arquivo(LINHA, LINHA))) == [ESPERADA, ESPERADA]


def test_aceita_colunas_em_qualquer_ordem_bom_crlf_e_linhas_em_branco():
    cabecalho = ", ".join(reversed(COLUNAS_TRANSACAO))
    linha = ",".join(reversed(LINHA.split(",")))
    conteudo = f"﻿{cabecalho}\r\n\r\n{linha}\r\n , ,\r\n{linha}\r\n".encode()
    assert list(ingestao.ler_csv(io.BytesIO(conteudo))) == [ESPERADA, ESPERADA]


@pytest.mark.parametrize(
    ("coluna", "valor", "campo", "esperado"),
    [
        ("Time", "10:35", "data_hora", datetime(2022, 10, 7, 10, 35)),
        ("Time", "23:59:59", "data_hora", datetime(2022, 10, 7, 23, 59, 59)),
        ("Date", "2024-02-29", "data_hora", datetime(2024, 2, 29, 10, 35, 19)),
        ("Sender_account", "1", "remetente", 1),
        ("Sender_account", "9223372036854775807", "remetente", 2**63 - 1),
        ("Receiver_account", " 42 ", "recebedor", 42),
        ("Amount", "0.01", "valor", Decimal("0.01")),
        ("Amount", "1459.155", "valor", Decimal("1459.16")),  # arredonda como NUMERIC(14,2)
        ("Amount", "1e3", "valor", Decimal("1000.00")),
        ("Amount", "999999999999.99", "valor", Decimal("999999999999.99")),
        ("Payment_currency", "  Naira ", "moeda_pagamento", "Naira"),
        ("Payment_type", "ACH", "tipo_pagamento", "ACH"),
    ],
)
def test_converte_campo_valido(coluna, valor, campo, esperado):
    [transacao] = ingestao.ler_csv(_arquivo(_com(coluna, valor)))
    assert getattr(transacao, campo) == esperado


@pytest.mark.parametrize(
    ("coluna", "valor", "mensagem"),
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
def test_recusa_campo_invalido_com_linha_e_coluna(coluna, valor, mensagem):
    [erro] = _erros(_arquivo(LINHA, _com(coluna, valor)))
    assert (erro.linha, erro.coluna) == (3, coluna)
    assert mensagem in erro.mensagem


@pytest.mark.parametrize(
    "rotulos", [["Is_laundering"], ["Laundering_type"], ["Is_laundering", "Laundering_type"]]
)
def test_recusa_colunas_de_avaliacao(rotulos):
    valores = {"Is_laundering": "1", "Laundering_type": "Structuring"}
    cabecalho = ",".join([*COLUNAS_TRANSACAO, *rotulos])
    erros = _erros(_arquivo(",".join([LINHA, *(valores[r] for r in rotulos)]), cabecalho=cabecalho))
    assert [(e.linha, e.coluna) for e in erros] == [(1, r) for r in rotulos]
    assert all("Rótulo de avaliação" in e.mensagem for e in erros)


def test_cabecalho_com_coluna_faltando_repetida_ou_desconhecida():
    cabecalho = CABECALHO.replace("Amount", "Time") + ",Canal,"
    erros = _erros(_arquivo(LINHA + ",x,", cabecalho=cabecalho))
    desconhecida = "Coluna desconhecida: use só as colunas de transação do SAML-D."
    assert [(e.linha, e.coluna, e.mensagem) for e in erros] == [
        (1, "Amount", "Coluna obrigatória ausente."),
        (1, "Time", "Coluna repetida."),
        (1, "Canal", desconhecida),
        (1, None, desconhecida),
    ]


@pytest.mark.parametrize("linha", [LINHA + ",extra", LINHA.rsplit(",", 1)[0]])
def test_linha_com_campos_a_mais_ou_a_menos(linha):
    [erro] = _erros(_arquivo(linha))
    assert (erro.linha, erro.coluna) == (2, None)
    assert "cabeçalho" in erro.mensagem


def test_junta_ate_max_erros_e_para_de_ler():
    arquivo = _arquivo(*[_com("Time", "99:99")] * 30)
    erros = _erros(arquivo)
    assert [e.linha for e in erros] == list(range(2, 2 + ingestao.MAX_ERROS))
    assert arquivo.tell() < len(arquivo.getvalue())
    assert len(_erros(_arquivo(*[_com("Time", "99:99")] * 30), max_erros=3)) == 3


def test_para_de_entregar_linhas_no_primeiro_erro():
    leitor = ingestao.ler_csv(_arquivo(LINHA, _com("Amount", "0"), LINHA))
    assert next(leitor) == ESPERADA
    with pytest.raises(TransacoesInvalidas) as exc:
        next(leitor)
    assert [e.linha for e in exc.value.erros] == [3]


@pytest.mark.parametrize(
    ("conteudo", "mensagem"), [(b"", "vazio"), (CABECALHO.encode() + b"\n\n", "só o cabeçalho")]
)
def test_arquivo_sem_transacoes(conteudo, mensagem):
    [erro] = _erros(io.BytesIO(conteudo))
    assert (erro.linha, erro.coluna) == (None, None)
    assert mensagem in erro.mensagem


def test_linhas_demais_para_assim_que_passa_do_limite():
    arquivo = _arquivo(*[LINHA] * 5)
    with pytest.raises(LinhasDemais) as exc:
        list(ingestao.ler_csv(arquivo, max_linhas=3))
    assert exc.value.limite == 3
    assert arquivo.tell() < len(arquivo.getvalue())
    assert list(ingestao.ler_csv(_arquivo(*[LINHA] * 3), max_linhas=3)) == [ESPERADA] * 3


def test_utf8_invalido_aponta_a_linha():
    conteudo = _arquivo(LINHA).getvalue() + "Ação".encode("latin-1") + b"\n"
    [erro] = _erros(io.BytesIO(conteudo))
    assert (erro.linha, erro.coluna) == (3, None)
    assert "UTF-8" in erro.mensagem


def test_linha_longa_demais():
    [erro] = _erros(_arquivo(LINHA, "x" * (ingestao.MAX_BYTES_LINHA + 1)))
    assert erro.linha == 3
    assert "KiB" in erro.mensagem


def test_campo_entre_aspas_sem_fechar_vira_erro_de_csv():
    aberto = '"' + ("a" * 1000 + "\n") * 200  # um campo de 200 KB: passa do limite do csv
    erros = _erros(_arquivo(LINHA, aberto))
    assert erros[-1].mensagem == "CSV malformado: confira as aspas."


def test_transacao_do_json_usa_as_mesmas_regras():
    registro = dict(zip(COLUNAS_TRANSACAO, LINHA.split(","), strict=True))
    assert ingestao.transacao({**registro, "Amount": 1459.15}) == ESPERADA
    # O float do JSON arredonda como o texto do CSV (1.005 vira 1.01, não 1.00).
    assert ingestao.transacao({**registro, "Amount": 1.005}).valor == Decimal("1.01")
    assert ingestao.transacao({**registro, "Amount": 0.1 + 0.2}).valor == Decimal("0.30")
    with pytest.raises(TransacoesInvalidas) as exc:
        ingestao.transacao({**registro, "Amount": float("inf"), "Sender_account": "x"})
    assert [(e.linha, e.coluna) for e in exc.value.erros] == [
        (None, "Sender_account"),
        (None, "Amount"),
    ]
