"""Guia em PT-BR das telas e controles do FraudRadar e validação de links de navegação."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from fraudradar.ai.alert_assessment import contains_identifiers

ALLOWED_LINK_TARGETS = (
    "dashboard",
    "alerts",
    "alert",
    "accounts",
    "monitoring",
    "ingestion",
    "settings",
)

ALLOWED_HREF_PATTERN = re.compile(
    r"^/(?:dashboard|alerts|accounts|monitoring|ingestion|settings)$|^/alerts/[1-9][0-9]*$"
)

MAX_CHAT_LINKS = 5
MAX_LINK_LABEL_CHARS = 60

_URL_OR_EMAIL_IN_LABEL = re.compile(r"(?i)(?:https?://|www\.|javascript:|[\w.+-]+@[\w.-]+)")


@dataclass(frozen=True)
class ScreenGuide:
    """Descrição estruturada de uma tela sob `web/src/app/(app)/`."""

    route_key: str
    href: str
    title: str
    summary: str
    controls: tuple[str, ...]


APP_SCREENS: dict[str, ScreenGuide] = {
    "dashboard": ScreenGuide(
        route_key="dashboard",
        href="/dashboard",
        title="Visão geral",
        summary=(
            "Painel executivo da semana selecionada com indicadores, gráficos de evolução e "
            "atalho para os 5 alertas prioritários."
        ),
        controls=(
            "Seletor de semana (botões Semana anterior, Próxima semana e lista de períodos)",
            "Link 'trocar na fila' / 'Ver fila completa →' para ir à Fila de alertas (/alerts)",
            (
                "Faixa de KPIs: Alertas na semana, Taxa de alerta, Valor sinalizado e "
                "Precisão confirmada"
            ),
            (
                "6 gráficos: Alertas por semana, Precisão confirmada, Distribuição da nota de "
                "risco, Andamento da revisão, Meio de pagamento e País"
            ),
            (
                "Tabela 'Comece por aqui' com os 5 principais alertas da semana (clicar em um "
                "alerta abre /alerts/{id})"
            ),
        ),
    ),
    "alerts": ScreenGuide(
        route_key="alerts",
        href="/alerts",
        title="Fila de alertas",
        summary=(
            "Triagem semanal das contas sinalizadas pelo modelo e da amostra de controle, com "
            "filtros, busca e paginação."
        ),
        controls=(
            "Seletor de semana de referência",
            "Abas de status: Todos, Pendentes, Em investigação, Para comunicação, Arquivados",
            "Campo 'Buscar alerta ou conta'",
            "Filtro de País ('Todos os países' ou um país específico)",
            (
                "Filtro de Origem do alerta ('Fila e amostra de controle', 'Só a fila do modelo', "
                "'Só a amostra de controle')"
            ),
            "Botão 'Limpar filtros' (quando a busca fica vazia)",
            (
                "Paginação ('Anterior' e 'Próxima') e linhas clicáveis que abrem o detalhe "
                "/alerts/{id}"
            ),
        ),
    ),
    "alerts/[id]": ScreenGuide(
        route_key="alerts/[id]",
        href="/alerts/{id}",
        title="Detalhe do alerta",
        summary=(
            "Investigação completa de um alerta específico: sinais SHAP, regras, movimentações, "
            "grafo de conexões, histórico, parecer da IA e registro de decisão/comunicação."
        ),
        controls=(
            "Link 'Fila · semana de ...' para voltar à Fila de alertas (/alerts)",
            (
                "Resumo no topo: status, posição na fila, país, selo 'Amostra de controle' quando "
                "aplicável, Nota de risco, Volume na semana e Movimentações"
            ),
            "Seção 'Por que entrou na fila' (contribuições SHAP) e 'Regras acionadas'",
            (
                "Tabela 'Movimentações da semana' e seção 'Conexões' (grafo até 2 saltos com "
                "botão 'Consultar conexões em texto · alternativa ao grafo')"
            ),
            "Card 'Outras semanas desta conta' com links para outros alertas da mesma conta",
            (
                "Card 'Parecer da IA': botões 'Gerar parecer' / 'Gerar novamente' e 'Ver parecer "
                "completo' (modal com 'Baixar (.md)' e 'Imprimir / PDF')"
            ),
            (
                "Formulário 'Decisão': escolhas 'Arquivar' (exige motivo 'Falso positivo "
                "confirmado' ou 'Sem evidência suficiente'), 'Aprofundar' ou 'Comunicar ao COAF'; "
                "campo 'Justificativa' e botão 'Registrar decisão'"
            ),
            "Card 'Comunicação ao COAF' (simulação): edição e botão 'Aprovar rascunho'",
        ),
    ),
    "accounts": ScreenGuide(
        route_key="accounts",
        href="/accounts",
        title="Contas suspeitas",
        summary=(
            "Lista consolidada de contas da fila do modelo ao longo de todos os períodos "
            "processados (a amostra de controle fica fora)."
        ),
        controls=(
            "Campo 'Buscar conta' (filtra por alias ou prefixo)",
            (
                "Filtro 'Filtrar por status' (Todos os status, Pendentes, Em investigação, "
                "Arquivados, Para comunicação)"
            ),
            "Filtros de data 'Período inicial' e 'Período final'",
            (
                "Tabela com maior nota, nota recente, períodos, primeiro/último período, país "
                "principal, valor sinalizado e status (clicar abre o alerta mais recente em "
                "/alerts/{id})"
            ),
            "Paginação ('Anterior' e 'Próxima')",
        ),
    ),
    "monitoring": ScreenGuide(
        route_key="monitoring",
        href="/monitoring",
        title="Monitoramento",
        summary=(
            "Acompanhamento operacional da fila na semana e do retorno confirmado pelos analistas, "
            "sem usar o gabarito do SAML-D."
        ),
        controls=(
            "Link 'trocar na fila' para mudar a semana em /alerts",
            (
                "Indicadores da fila: Alertas no lote, Taxa de alerta, Revisados e Comunicações "
                "aprovadas (simulação)"
            ),
            "Gráficos 'Taxa de alerta por país' e 'Taxa de alerta por meio de pagamento'",
            (
                "Painel 'Retorno dos analistas': Precisão confirmada, Lavagem fora da fila "
                "(amostra de controle), Rótulos do retorno, Novos desde a versão ativa e gráfico "
                "semanal"
            ),
            (
                "Aviso de que versões do modelo e métricas de validação contra o gabarito ficam "
                "em Configurações > Modelo"
            ),
        ),
    ),
    "ingestion": ScreenGuide(
        route_key="ingestion",
        href="/ingestion",
        title="Fontes de dados",
        summary=(
            "Entrada de transações no conjunto atual (CSV SAML-D, registro manual, conexões "
            "Postgres externas) e controles de execução do processamento."
        ),
        controls=(
            "Botão 'Processar agora' (enfileira o processamento do conjunto atual)",
            (
                "Botão 'Simular transações' (visível com modo demonstração ativo; abre diálogo "
                "para definir quantidade, dias e padrão fan-out com botão 'Simular e processar')"
            ),
            (
                "Card 'Importar CSV': área de arrastar/soltar, botão 'Escolher arquivo', prévia "
                "das 11 colunas obrigatórias e botões 'Enviar arquivo para ingestão' e 'Cancelar'"
            ),
            (
                "Card 'Conexões com bancos externos': botão 'Nova conexão' (formulário com "
                "'Salvar conexão'), ações 'Testar' (gera Relatório de compatibilidade), 'Remover' "
                "/ 'Confirmar remoção' e fluxo 'Confirmar e importar'"
            ),
            (
                "Tabela 'Envios recentes' e seção expansível 'Adicionar transação individual "
                "(registro manual)' com botão 'Registrar transação'"
            ),
        ),
    ),
    "settings": ScreenGuide(
        route_key="settings",
        href="/settings",
        title="Configurações",
        summary=(
            "Preferências da conta, aparência, automação do processamento, gestão de versões do "
            "modelo e saúde do sistema."
        ),
        controls=(
            "Card 'Perfil': campo 'Nome' e botão 'Salvar perfil'",
            (
                "Card 'Aparência': temas prontos (Grafite, Oceano, Musgo, Escuro, Personalizado), "
                "botão 'Personalizar cores' / 'Ocultar personalização' e seletor de 'Idioma'"
            ),
            (
                "Card 'Processamento': campos 'Intervalo automático (minutos)', 'Processamento "
                "automático ativo', 'Modo demonstração', 'Amostra de controle por semana' e botão "
                "'Salvar processamento'"
            ),
            (
                "Card 'Modelo': versão ativa, métricas de validação contra o gabarito (PR-AUC, "
                "Recall da fila, Precisão da fila, Inocentes por semana), botão 'Treinar nova "
                "versão' (diálogo com opções de retorno e botão 'Treinar') e botão 'Promover' / "
                "'Confirmar promoção'"
            ),
            "Card 'Sistema': estado de saúde da API e do banco",
        ),
    ),
}

GLOBAL_SHELL_GUIDE = (
    "Barra superior e menu lateral (presentes em todas as telas): "
    "Seletor de conjunto de dados (muda o dataset ativo via X-Dataset); "
    "botão 'Assistente' (abre este painel lateral de chat, com seleção de modelo, histórico de "
    "conversas e botão de nova conversa); "
    "botão 'Aparência' (atalho para tema e cores); "
    "botão 'Notificações' (lista alertas pendentes da semana); "
    "seletor de idioma (PT-BR/EN); "
    "menu da conta (acesso rápido a Configurações e Sair); "
    "e menu lateral com grupos Análise (Visão geral, Fila de alertas, Contas suspeitas), "
    "Qualidade (Monitoramento), Dados (Fontes de dados) e Conta (Configurações)."
)


def format_app_guide() -> str:
    """Monta o texto completo em PT-BR com todas as telas e controles do sistema."""
    sections = [GLOBAL_SHELL_GUIDE, "Telas do FraudRadar:"]
    for screen in APP_SCREENS.values():
        controls_text = "; ".join(screen.controls)
        sections.append(
            f"- {screen.title} ({screen.href}): {screen.summary} "
            f"Controles principais: {controls_text}."
        )
    return "\n".join(sections)


APP_GUIDE_TEXT = format_app_guide()


def build_navigation_link(
    target: str,
    *,
    alert_id: int | None = None,
    label: str = "",
) -> dict[str, str] | None:
    """Constrói e valida um link interno permitido; retorna None se inválido."""
    if not isinstance(target, str) or target not in ALLOWED_LINK_TARGETS:
        return None

    if target == "alert":
        if isinstance(alert_id, bool) or not isinstance(alert_id, int) or alert_id < 1:
            return None
        href = f"/alerts/{alert_id}"
    else:
        href = f"/{target}"

    if not ALLOWED_HREF_PATTERN.fullmatch(href):
        return None

    cleaned_label = " ".join(str(label).split())[:MAX_LINK_LABEL_CHARS].rstrip()
    if not cleaned_label:
        return None
    if _URL_OR_EMAIL_IN_LABEL.search(cleaned_label):
        return None

    return {"href": href, "label": cleaned_label}


def validate_links(
    links: Sequence[Mapping[str, Any]],
    *,
    forbidden_identifiers: Iterable[str] = (),
) -> list[dict[str, str]]:
    """Filtra links mantendo apenas destinos internos válidos, únicos e sem identificadores."""
    forbidden = tuple(forbidden_identifiers)
    validated: list[dict[str, str]] = []
    seen_hrefs: set[str] = set()

    for item in links:
        if not isinstance(item, Mapping):
            continue
        href = item.get("href")
        raw_label = item.get("label")
        if not isinstance(href, str) or not isinstance(raw_label, str):
            continue
        if not ALLOWED_HREF_PATTERN.fullmatch(href):
            continue
        label = " ".join(raw_label.split())[:MAX_LINK_LABEL_CHARS].rstrip()
        if not label or _URL_OR_EMAIL_IN_LABEL.search(label):
            continue
        if forbidden and contains_identifiers(label, forbidden_values=forbidden):
            continue
        if href in seen_hrefs:
            continue
        seen_hrefs.add(href)
        validated.append({"href": href, "label": label})
        if len(validated) >= MAX_CHAT_LINKS:
            break

    return validated
