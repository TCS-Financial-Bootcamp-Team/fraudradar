"""Referência conceitual das tipologias dos alertas, sem rótulos de transações."""

TYPOLOGY_GLOSSARY = {
    "structuring": "Estruturação: fracionamento de valores em operações menores e repetidas.",
    "smurfing": (
        "Smurfing: fracionamento distribuído entre várias pessoas ou contas intermediárias."
    ),
    "cash_withdrawal": (
        "Saque em espécie: retirada de recursos que reduz a rastreabilidade posterior."
    ),
    "deposit_send": (
        "Depósito e envio: entrada de recursos seguida de transferência para outra conta."
    ),
    "fan_out": "Fan-out: uma conta dispersa recursos para várias contas destinatárias.",
    "fan_in": "Fan-in: uma conta concentra recursos recebidos de várias contas de origem.",
    "layered_fan_out": "Fan-out em camadas: dispersão para vários destinos em etapas sucessivas.",
    "layered_fan_in": "Fan-in em camadas: concentração de várias origens em etapas sucessivas.",
    "bipartite": "Bipartido: transferências entre dois conjuntos distintos de contas.",
    "stacked_bipartite": (
        "Bipartido empilhado: conjuntos bipartidos conectados em camadas sucessivas."
    ),
    "gather_scatter": "Concentração e dispersão: várias origens convergem antes de novos envios.",
    "scatter_gather": "Dispersão e concentração: recursos se espalham e depois voltam a convergir.",
    "cycle": "Ciclo: recursos percorrem contas e retornam a uma conta anterior do trajeto.",
    "single_large": "Transação única de alto valor: operação isolada de volume elevado.",
    "over_invoicing": (
        "Superfaturamento: valores faturados acima do bem ou serviço para mover recursos."
    ),
    "behavioural_change_1": (
        "Mudança de comportamento 1: variante do SAML-D de alteração no padrão transacional; "
        "compare com o histórico sem inferir a causa apenas pelo código."
    ),
    "behavioural_change_2": (
        "Mudança de comportamento 2: outra variante do SAML-D de alteração transacional; "
        "o código sozinho não descreve a causa da mudança."
    ),
}

TYPOLOGY_REFERENCE = (
    "Os códigos abaixo descrevem padrões, não comprovam crime. Padrões como fan-out e fan-in "
    "também podem ocorrer em atividades legítimas; compare com o perfil e o histórico. "
    "Não deduza o gabarito do dataset nem a tipologia de uma conta apenas pelo nome.\n"
    + "\n".join(f"{code}: {description}" for code, description in TYPOLOGY_GLOSSARY.items())
)
