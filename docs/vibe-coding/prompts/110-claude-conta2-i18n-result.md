---
id: 110
area: frontend
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 109
data: 2026-11-13
tipo: resposta
modelo: claude-sonnet-5-5
---

# Resultado do prompt 109/110: troca de idioma do front (PT-BR e inglês)

Branch `feat/i18n`, criada de `origin/feat/analyst-feedback` (ainda não mergeada). São 13 commits
de código e este registro. Não fiz push, PR nem merge.

## O que mudou

| Passo | Commits | O que mudou |
|---|---|---|
| 1. Infraestrutura | `5412e2d` | `next-intl` **4.14.9** (exato; a 4.15.x tem menos de duas semanas) sem idioma na URL: `src/i18n/` (cookie `NEXT_LOCALE`, `request.ts`, tipos, `getT` fora do React, formatação por idioma, validação). Mensagens em `web/messages/{pt-BR,en}/<módulo>.json`, tipadas pelo pt-BR. Teste de paridade de chaves e de marcadores ICU |
| 2. Seletor | `a7d321f` | grupo "PT \| EN" (`aria-pressed`, rótulo, teclado, tokens do tema, serve no celular) no cabeçalho, em login/cadastro e em Configurações > Aparência. `<html lang>` e `<title>` seguem o cookie, sem piscar (a raiz é renderizada sob demanda: `instant = false`, porque ler cookie na raiz exige isso com `cacheComponents`) |
| 3. Telas | `a7d321f`, `c4d7be4`, `43d380f`, `f62f0c0`, `a83b1b1`, `11c5580`, `891adc1` | casca, auth, configurações, processamento, saúde, trabalhos, conjuntos, contas, alertas (fila, detalhe, painel, gráficos, monitoramento), retorno dos analistas, modelos, ingestão, assistente, títulos de página, toasts, zod, `api.ts` e `format.ts` |
| 4. Servidor | `7ce75c4`, `2df1aac`, `1f0925e`, `8e962ec` | `AppError(status, code, mensagem, params)` e handler (`detail` em português como antes, mais `code` e `params`); `jobs.message_code` e `message_params` (`003_platform.sql` e `db/upgrades/007_i18n.sql`, no README); motivos do retreino, trava de promoção, sugestão de compatibilidade, itens do relatório de compatibilidade, erros de estrutura do CSV e recibo do envio com código; séries semanais ganham `week` (ISO) |
| 5. Documentação | `66c7d96` | `AGENTS.md`, `web/AGENTS.md`, `api/AGENTS.md`, as duas skills (cópias iguais) e `docs/glossary.md` com a coluna "EN (tela)" |

O front traduz por `code` + `params` (`errors.api`, chave = código com `.` trocado por `_`) e cai no
`detail` ou no `message` em português quando o código não existe. Um teste
(`web/tests/i18n-server-codes.test.ts`) varre o Python e falha se um código novo não tiver texto
nos dois idiomas.

## Verificação

| Comando | Resultado |
|---|---|
| `uv run ruff check . && uv run ruff format --check .` | limpo (270 arquivos) |
| `TEST_DATABASE_URL=...@127.0.0.1:5432/fraudradar_i18n_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest` | 631 passed, 0 skipped |
| `cd web && pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build` | lint limpo; 84 testes, 84 passaram, 0 pulados (eram 73); build ok com checagem de tipos |
| `curl /login` na build, com e sem cookie | sem cookie e com `fr`: `<html lang="pt-BR">`, "Entrar"; com `NEXT_LOCALE=en`: `<html lang="en">`, "Sign in", título "FraudRadar AML" |

Testes novos: paridade de idiomas (chaves e ICU), cookie inválido cai em pt-BR, `getT`, formatação
por idioma, `errorMessageFor` por código, código desconhecido volta ao `detail`, códigos do servidor
com texto nos dois idiomas; no Python (`tests/api/test_i18n_messages.py`): formato do erro, todo
`raise` da API é `AppError`, erro não convertido segue só com `detail`, códigos do retreino, da trava
e da sugestão, 409 de promoção com o código da trava, colunas de `jobs` preenchidas (progresso,
final, falha com código, falha genérica), o `007` aplicado duas vezes (num banco `_test`), série
semanal com `week`.

Prova de que não sobrou texto de tela em português em `web/src` (grep de acentos, fora de
comentários): só restam `services/alerts-service.ts` (parecer simulado da IA, conteúdo de LLM em
modo demonstração), `services/ingestion-service.ts` (dois recibos do modo demonstração e uma
`DOMException` que não aparece na tela) e as de cancelamento em `jobs-service.ts` e `lib/api.ts`.

## Decisões que tomei

- `next-intl` 4.14.9: suporta Next 16 e React 19 (peer deps), sem precisar do plano B caseiro.
- Os formatadores ganharam o idioma como último argumento opcional (padrão pt-BR), em vez de ler o
  idioma de um global: no servidor, ler do documento daria uma hidratação diferente. Componentes usam
  `useFormatters()`. As funções fora do React (`getT`, serviços, `notify`) leem `<html lang>`.
- Plural em ICU com `=1 {…} other {…}`, não `one`: em português o `one` do ICU vale também para 0.
- O teste de marcadores compara os **nomes** dos argumentos, não o tipo: pt `{count} conta(s)` e en
  `{count, plural, …}` são a mesma coisa.
- Mensagem de validação (zod) é uma chave (`validation:nome`) traduzida na hora de mostrar o erro,
  porque os schemas vivem fora do React.
- `Msg` é uma subclasse de `str` (texto em português + `code` + `params`): quem só quer o texto
  (`==`, `WorkerError`, f-string) não mudou, e os testes antigos seguem valendo.
- `AppError` herda de `HTTPException`: o rollback e os `except HTTPException` continuam.
- 422 de conteúdo do CSV segue no formato do Pydantic; os códigos de cada item vão em
  `params.errors` (mesma ordem), para não quebrar quem lê `[{type, loc, msg}]`.
- `PRESETS[*].label` (Grafite, Oceano...) ficou no código como nome interno; a tela mostra o texto
  de `settings.appearance.themes`.
- O seletor de Configurações fica dentro do cartão Aparência; o do cabeçalho aparece em todas as
  larguras (no celular quem encolhe é o título da página, que já truncava).
- Separei `feat(web)` e `feat(api)`, mas a mudança do recibo do envio (`Receipt.message_code`, na API)
  entrou no commit da ingestão do front (`11c5580`).

## O que ficou de fora de propósito

- Mocks de `services/` (modo demonstração): dados e mensagens simuladas continuam em português.
- Nomes de contribuições e regras do alerta (`evidence.contributions`, `evidence.rules`): são dados
  que o worker grava em português; o front mostra como vieram.
- `connections.last_error` (texto guardado no banco) e as mensagens de erro de **campo** de uma linha
  do CSV (`Use HH:MM...`), que vêm da validação de `fraudradar.data.ingestion`: seguem em português.
- Mensagens de etapa do treino (`train_version` chama `progress` com texto próprio) e as `notes` do
  `worker/batch.py` ("nada a processar..."): seguem em português, sem código.
- O relato ao COAF (sempre em português; no inglês o rótulo diz "COAF report (in Portuguese)").
- Logs do servidor.

## O que ainda está em aberto

- Falta conferir no navegador, com a mão (inclusive em 360 px), a troca ao vivo (clicar em "EN" e ver `router.refresh()`
  refazer a tela). Conferi o SSR por cookie e os testes, não a interação.
- Redação em inglês é minha: vale uma leitura do time (principalmente os textos de trava e de retreino).
- Código novo na API exige texto novo em `errors.api` nos dois idiomas; o teste avisa.
- Mensagens de etapa do treino, `notes` do batch e erros de campo do CSV ainda não têm código.
