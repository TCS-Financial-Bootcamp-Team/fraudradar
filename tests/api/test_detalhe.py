"""GET /alertas/{id}: contribuições, regras, movimentações e parecer."""

from datetime import date, datetime, timedelta

SEMANA = date(2023, 1, 2)
INICIO = datetime(2023, 1, 2, 0, 0)
FIM = INICIO + timedelta(days=7)
CONTA = 100


def _detalhe(cliente, alerta_id) -> dict:
    r = cliente.get(f"/alertas/{alerta_id}")
    assert r.status_code == 200, r.text
    return r.json()


def test_alerta_inexistente_da_404(cliente):
    assert cliente.get("/alertas/999").status_code == 404


def test_id_invalido_da_422(cliente):
    assert cliente.get("/alertas/abc").status_code == 422


def test_campos_base_do_alerta(cliente, semente):
    a = semente.alerta(CONTA, SEMANA, score=0.5, status="aprofundado")
    d = _detalhe(cliente, a)
    assert (d["id"], d["conta"], d["score"], d["status"]) == (str(a), "100", 50.0, "aprofundar")


def test_sem_evidencias_nem_parecer(cliente, semente):
    d = _detalhe(cliente, semente.alerta(CONTA, SEMANA))
    assert d["contribuicoes"] == []
    assert d["regras"] == []
    assert d["movimentacoes"] == []
    assert d["parecer"] is None


# --- contribuições ---------------------------------------------------------------------------


def test_contribuicoes_descartam_negativas_e_normalizam_pelas_positivas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.evidencias(a, contribuicoes={"x": 3.0, "y": 1.0, "z": -5.0, "w": 0.0})
    cs = _detalhe(cliente, a)["contribuicoes"]
    # 3/4 e 1/4: os negativos e o zero não entram no denominador.
    assert cs == [{"nome": "x", "valor": 75.0}, {"nome": "y", "valor": 25.0}]


def test_contribuicoes_so_top_6_mas_percentual_sobre_todas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    # 8 positivas: 8,7,...,1 (soma 36). Top 6 = 8..3.
    semente.evidencias(a, contribuicoes={f"f{i}": float(i) for i in range(1, 9)})
    cs = _detalhe(cliente, a)["contribuicoes"]
    assert [c["nome"] for c in cs] == ["f8", "f7", "f6", "f5", "f4", "f3"]
    assert cs[0]["valor"] == round(8 / 36 * 100, 1)
    assert sum(c["valor"] for c in cs) < 100


def test_contribuicoes_arredondam_para_1_casa(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.evidencias(a, contribuicoes={"a": 1.0, "b": 2.0})
    cs = _detalhe(cliente, a)["contribuicoes"]
    assert [c["valor"] for c in cs] == [66.7, 33.3]


def test_contribuicoes_usam_rotulo_e_caem_no_nome_da_feature(cliente, semente, monkeypatch):
    from fraudradar import features

    # ROTULOS ainda está vazio no pacote; o teste não depende do conteúdo real.
    monkeypatch.setitem(features.ROTULOS, "feature_com_rotulo", "Rótulo bonito")
    a = semente.alerta(CONTA, SEMANA)
    semente.evidencias(a, contribuicoes={"feature_com_rotulo": 2.0, "feature_sem_rotulo": 1.0})
    nomes = [c["nome"] for c in _detalhe(cliente, a)["contribuicoes"]]
    assert nomes == ["Rótulo bonito", "feature_sem_rotulo"]


def test_contribuicoes_ignoram_valores_nao_numericos(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.evidencias(a, contribuicoes={"a": 1.0, "b": "2", "c": True, "d": None})
    assert _detalhe(cliente, a)["contribuicoes"] == [{"nome": "a", "valor": 100.0}]


def test_contribuicoes_sem_nenhuma_positiva_devolvem_lista_vazia(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.evidencias(a, contribuicoes={"a": -1.0, "b": 0.0})
    assert _detalhe(cliente, a)["contribuicoes"] == []


# --- regras ----------------------------------------------------------------------------------


def test_regras_em_ordem_e_ignoram_malformadas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.evidencias(
        a,
        regras=[
            {"codigo": "R-002", "descricao": "Segunda", "detalhe": {"x": 1}},
            "texto solto",
            {"codigo": "R-X"},
            {"descricao": "sem código"},
            {"codigo": 3, "descricao": "código numérico"},
            {"codigo": "R-Y", "descricao": None},
            {"codigo": "R-001", "descricao": "Primeira"},
        ],
    )
    assert _detalhe(cliente, a)["regras"] == [
        {"codigo": "R-002", "descricao": "Segunda"},
        {"codigo": "R-001", "descricao": "Primeira"},
    ]


# --- movimentações ---------------------------------------------------------------------------


def test_movimentacao_mapeia_campos(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    t = semente.transacao(
        CONTA, 200, datetime(2023, 1, 3, 10, 30, 5), 55.5, moeda="Euro", tipo="Cash Deposit"
    )
    assert _detalhe(cliente, a)["movimentacoes"] == [
        {
            "id": str(t),
            "data": "2023-01-03T10:30:05",
            "origem": "100",
            "destino": "200",
            "valor": 55.5,
            "moeda": "GBP",  # o valor do SAML-D é sempre em libras
            "meio": "Cash Deposit",
            "moeda_pagamento": "Euro",
        }
    ]


def test_movimentacoes_incluem_enviadas_e_recebidas_ordenadas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    recebida = semente.transacao(300, CONTA, INICIO + timedelta(hours=1))
    enviada_tarde = semente.transacao(CONTA, 200, INICIO + timedelta(hours=5))
    enviada_cedo = semente.transacao(CONTA, 201, INICIO + timedelta(hours=1))  # empata com recebida
    semente.transacao(300, 301, INICIO + timedelta(hours=2))  # alheia
    ids = [m["id"] for m in _detalhe(cliente, a)["movimentacoes"]]
    # empate de data_hora desempata por id
    assert ids == [str(recebida), str(enviada_cedo), str(enviada_tarde)]


def test_autotransferencia_aparece_uma_vez(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    t = semente.transacao(CONTA, CONTA, INICIO + timedelta(days=1))
    assert [m["id"] for m in _detalhe(cliente, a)["movimentacoes"]] == [str(t)]


def test_janela_inclui_segunda_00h_e_exclui_a_proxima_segunda_00h(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, INICIO - timedelta(seconds=1))
    dentro_inicio = semente.transacao(CONTA, 200, INICIO)
    dentro_fim = semente.transacao(200, CONTA, FIM - timedelta(seconds=1))
    semente.transacao(CONTA, 200, FIM)
    semente.transacao(200, CONTA, FIM)
    ids = [m["id"] for m in _detalhe(cliente, a)["movimentacoes"]]
    assert ids == [str(dentro_inicio), str(dentro_fim)]


def test_movimentacoes_acima_de_200_ficam_as_maiores_em_ordem_cronologica(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    valores = [100 + (i * 37) % 205 for i in range(205)]  # permutação: as 5 menores se espalham
    ids = []
    for i, valor in enumerate(valores):
        origem, destino = (CONTA, 200) if i % 2 else (200, CONTA)
        ids.append(semente.transacao(origem, destino, INICIO + timedelta(minutes=i), valor))
    movs = _detalhe(cliente, a)["movimentacoes"]
    menores = {ids[i] for i, valor in enumerate(valores) if valor < 105}
    assert len(menores) == 5 and menores != set(ids[-5:])  # cortar por data daria outro resultado
    assert [m["id"] for m in movs] == [str(i) for i in ids if i not in menores]


# --- parecer ---------------------------------------------------------------------------------


def test_parecer_mais_recente_vence(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.parecer(a, "novo", criado_em=datetime(2023, 1, 5, 12, 0))
    semente.parecer(a, "antigo", criado_em=datetime(2023, 1, 4, 12, 0))
    assert _detalhe(cliente, a)["parecer"]["texto"] == "novo"


def test_parecer_empatado_no_tempo_desempata_pelo_maior_id(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    quando = datetime(2023, 1, 5, 12, 0)
    semente.parecer(a, "primeiro", criado_em=quando)
    semente.parecer(a, "segundo", criado_em=quando)
    assert _detalhe(cliente, a)["parecer"]["texto"] == "segundo"


def test_parecer_ignora_fontes_malformadas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.parecer(
        a,
        "texto [1]",
        fontes=[
            {"titulo": "[1] Lei", "trecho": "art. 1"},
            {"titulo": "sem trecho"},
            {"trecho": "sem título"},
            {"titulo": 1, "trecho": "x"},
            "solta",
            {"titulo": "[2] Circular", "trecho": "art. 2"},
        ],
    )
    assert _detalhe(cliente, a)["parecer"] == {
        "texto": "texto [1]",
        "fontes": [
            {"titulo": "[1] Lei", "trecho": "art. 1"},
            {"titulo": "[2] Circular", "trecho": "art. 2"},
        ],
    }


def test_parecer_de_outro_alerta_nao_vaza(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    b = semente.alerta(101, SEMANA, posicao=2)
    semente.parecer(b, "do outro")
    assert _detalhe(cliente, a)["parecer"] is None
