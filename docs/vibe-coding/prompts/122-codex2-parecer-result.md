---
id: 122
area: backend
autor: Codex CLI (conta 2 do Pedro, gpt-5.6-sol)
destino: Claude Code (conta 2, do Pedro)
pai: 121
data: 2026-11-17
tipo: resposta
---

# Resultado da delegação 121: parecer e chat do alerta sobre a main nova

Duas rodadas na mesma sessão do Codex: a delegação 121 e uma revisão do Claude, com sete ajustes
(abaixo).

## Primeira rodada

- **Conflito com o #22 resolvido em `api/routes/ai.py`.** As três rotas usam um tradutor de erro só:
  - 503 `ai.not_configured`: sem a configuração do Gemini, checada antes de abrir o banco;
  - 503 `ai.no_legal_sources`: sem a base jurídica carregada;
  - 502 `ai.provider_failed`: resposta sem citação conferível, ou outra falha do Gemini;
  - 429 `ai.provider_rate_limited` e 503 `ai.provider_unavailable`: limite ou indisponibilidade do
    Gemini;
  - 502 `ai.invalid_assessment`: parecer que não passa na validação.

  Saíram o import solto no fim do arquivo e a comparação com o texto da exceção.
- **Bug dos ids curtos.** O id do alerta deixou de ser identificador proibido. A busca passou a
  casar só o número completo, nunca um pedaço de outro número nem a parte inteira de `35102.0`. Há um teste com os alertas 1 a 5000.
- **Erros codificados:**
  - 500 `ai.context_blocked`: o guarda de privacidade barrou o contexto;
  - 422 `ai.question_too_long`: pergunta e resumo passam de 2.000 caracteres;
  - 422 `ai.alert_context_mismatch`: o alerta do corpo difere do alerta do caminho.

  Saíram `ai.model_not_configured` e `ai.generation_failed`.
- **Lugar do código.** A montagem do contexto, o guarda, os prompts e o vocabulário de tipologias
  foram para `src/fraudradar/ai/alert_assessment.py`, como pede o `api/AGENTS.md`. `api/` ficou com
  a leitura do banco, a gravação e as rotas. `api/alert_ai_context.py` foi apagado.
- **Busca jurídica.** `answer_legal_chat` ganhou `retrieval_query`:
  - no parecer, uma pergunta fixa;
  - no chat do alerta, só a pergunta do analista, higienizada;
  - o `POST /chat` não mudou.
- **Tipologia sugerida:**
  - o parecer termina com `Tipologia sugerida: <código>`, um dos 17 códigos do SAML-D;
  - o código vai para `assessments.suggested_typology` e o rótulo em português para
    `alerts.typology`, na mesma transação;
  - código ausente ou inválido não mexe no alerta.
- **Auditoria.** Gerar parecer grava `assessment_generated` em `audit_log` com o analista. O
  escritor de auditoria passou para `api/repositories/audit.py`, usado também pelas decisões.
- **Traduções.** Os quatro códigos novos ganharam texto em `web/messages/pt-BR/errors.json` e
  `web/messages/en/errors.json`.

Verificação da primeira rodada: `ruff` limpo; `pytest` com Postgres: 748 passaram, 0 falharam,
0 pulados; `pnpm test`: 84 de 84.

## Revisão do Claude (segunda rodada)

1. Os ids de transação saíram da lista de proibidos. Num conjunto criado pela API, eles começam em
   1, e um id 19 ou 2023 colidiria com a data "2023-06-19" do contexto.
2. A pergunta fixa do parecer foi trocada pela que trouxe os arts. 11 e 10 na base real da Lei
   9.613. A anterior trazia os arts. 11, 14 e 15 (deveres do próprio COAF).
3. O leitor da linha da tipologia aceita negrito, crase e ponto final, e continua estrito no código.
4. A tipologia atual do alerta não vai mais para o LLM. Ela só vem de um parecer anterior, e
   mandá-la de volta ancoraria o próximo.
5. Gemini fora do ar durante o parecer responde 503 `ai.provider_unavailable`, não 502. A
   comparação é com o texto de reserva exportado pelo adaptador, por igualdade.
6. As rotas só traduzem os erros do guarda e do tamanho. Um erro de programação não aparece mais
   como "contexto bloqueado".
7. O texto de `ai.not_configured` passou a falar da IA em geral, porque também vale para o parecer.

Verificação da segunda rodada: `ruff` limpo; `pytest` com Postgres: 756 passaram; `pnpm test`: 84
de 84.

## Terceira rodada: parecer em texto simples no rascunho ao COAF (pedido 126)

- `assessment_plain_text` em `src/fraudradar/ai/alert_assessment.py` tira o markdown do parecer:
  - tira negrito, itálico, crase, `#` de título e `>` de citação;
  - transforma `*`, `+` e `•` em `- `;
  - mantém listas numeradas, quebras de linha, `[F1]` e o `_` no meio de palavra (`fan_out`);
  - transforma `[texto](https://...)` em `texto (https://...)`.
- `build_report_draft` (`api/repositories/decisions.py`) usa a função só no trecho "Parecer mais
  recente". O parecer gravado continua em markdown, que o front formata (PR do registro 128).
- Testes da função e um teste com Postgres do rascunho.

Verificação final do Codex: `ruff` limpo; `pytest` com Postgres: 759 passaram; `pnpm test`: 84
de 84.

O Claude repetiu tudo num banco novo, sem nada pulado: `uv lock --check`, `ruff check` e
`ruff format --check` passaram, e o `pytest` deu 759 de 759. No front, `pnpm lint`, `pnpm test`
(84 de 84) e `pnpm build` passaram.
