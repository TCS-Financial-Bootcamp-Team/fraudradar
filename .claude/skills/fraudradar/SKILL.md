---
name: fraudradar
description: Regras de trabalho do repositório FraudRadar PLD (projeto de bootcamp, 5 pessoas). Use em QUALQUER tarefa neste repositório, antes de editar, commitar, abrir PR, mexer no dataset SAML-D ou delegar para outra IA. Cobre o projeto e onde está cada coisa, regras invioláveis, idioma, o lab/ para experimentos com o dataset, padrão de commits e branches, e o registro obrigatório de prompts em docs/vibe-coding/prompts/.
---

# FraudRadar: como trabalhar neste repositório

Esta skill vale para qualquer IA (Claude Code, Codex, Cursor, Antigravity,
Copilot...) de qualquer pessoa do time. Ela resume as regras; quando houver
divergência, vale o arquivo citado como fonte.

Cópias: `.agents/skills/fraudradar/SKILL.md` (original) e
`.claude/skills/fraudradar/SKILL.md`. Mudou uma, copie para a outra: o
`tests/test_agent_skill.py` falha se elas forem diferentes.

## 1. O projeto

Monitoramento antilavagem de dinheiro (PLD) sobre o dataset sintético SAML-D.
Um worker semanal dá score às transações com LightGBM e monta a fila de alertas
por conta; um LLM com RAG redige o parecer; o analista decide (arquivar,
aprofundar, comunicar ao COAF). Não há tempo real: o replay avança uma semana
por vez.

| Pasta | O quê | Leia antes |
|---|---|---|
| `src/fraudradar/` | pacote compartilhado: `data`, `features`, `model`, `ai`, `config.py`, `db.py` | `AGENTS.md` |
| `api/` | FastAPI, read-model sobre o Postgres | `api/AGENTS.md` |
| `worker/` | lote semanal e replay (`python -m worker ...`) | `AGENTS.md` |
| `web/` | Next.js; componente → hook → service → API | `web/AGENTS.md` |
| `vibelog/` | árvore de prompts do vibe-coding (Supabase) | `vibelog/AGENTS.md` |
| `db/init/`, `db/rules/` | esquema e regras de cenário | `db/init/002_tables.sql` |
| `notebooks/` | notebooks oficiais, revisados | `notebooks/README.md` |
| `lab/` | rascunho da equipe, fora do git | `lab/README.md` |
| `docs/glossary.md` | mapa entre os termos do time e os nomes do código | sempre que criar um nome |

Visão geral, rotas e comandos: `README.md`. Frentes: 1 Dados e SQL, 2 Modelo,
3 IA generativa, 4 API e front, 5 Processo e entrega (tabela "Quem cuida de
quê" no README).

## 2. Regras invioláveis

- Features e score vivem **só** em `src/fraudradar`. API, worker e notebooks
  importam; nunca reimplementam.
- O modelo nunca lê a tabela `ground_truth` nem as colunas `Is_laundering` e
  `Laundering_type`, nem nada calculado a partir delas. É vazamento.
- O LLM nunca recebe número de conta: pseudonimize antes do prompt. A chave do
  LLM fica só na API.
- `torch` e `lightgbm` ficam nos grupos `ml`/`ai`; a imagem da API usa só `api`.
- Nunca leia o `data/SAML-D.csv` inteiro para inspecionar (1 GB): `head`,
  `nrows` ou uma amostra em parquet.
- Mudança de esquema: edite `db/init/002_tables.sql`, use `!` no commit e
  avise no corpo que exige `docker compose down -v`.
- Nunca commite `.env`, chaves, o CSV, parquet, nem arquivos de `models/`.

## 3. Idioma

- **Inglês** em tudo que é código: identificadores, arquivos, pastas, tabelas,
  colunas, valores gravados, rotas, campos JSON, variáveis de ambiente,
  comandos e flags.
- **Português (PT-BR)** no que uma pessoa lê: textos de tela, mensagens de erro
  que chegam à tela, documentação, comentários, docstrings, logs, descrições de
  teste e mensagens de commit.
- Nome novo segue `docs/glossary.md`. Nome que cruza fronteira (banco ↔ API ↔
  front, env, rota) e não está lá: escolha a tradução óbvia e acrescente ao
  glossário no mesmo PR.

## 4. Dataset: experimentos só em `lab/`

Qualquer exploração, gráfico, teste de modelo, script rápido ou brincadeira
com o SAML-D vai para `lab/<pessoa>/`, onde `<pessoa>` é quem pediu a tarefa
(`lab/pedro/`, `lab/victor/`). Vale também para o `python -c` de uma linha que
virou arquivo, para a amostra em parquet e para o notebook de teste.

- **Não** coloque experimento em `src/`, `notebooks/`, `tests/`, `api/`,
  `worker/` nem na raiz. `notebooks/` é para os notebooks oficiais e revisados.
- `lab/` fica fora do git (só o README e o `FraudRadar_LSTM.ipynb` são
  versionados). Não abra exceção nova no `.gitignore` sem o time concordar.
- Nada de produção importa de `lab/`. O experimento deu certo? Leve a lógica
  para `src/fraudradar` com teste, num PR, e cite no registro do prompt de onde
  veio.
- Em `lab/` pode olhar `Is_laundering` e `Laundering_type` à vontade para
  analisar; nunca use como entrada de modelo.
- Avalie modelo com corte no tempo (treina nas semanas antigas, testa nas
  seguintes). Divisão aleatória dá métrica otimista.
- `Amount` está em libras, seja qual for `Payment_currency`. Não converta.
- Arquivo descartável que não tem a ver com o dataset vai para `trash/`
  (também fora do git) e é apagado no fim.

Detalhes e código de exemplo: `lab/README.md`.

## 5. Commits, branches e PR

Fonte: `CONTRIBUTING.md`. Resumo:

```
<tipo>(<escopo>): <resumo no imperativo, minúsculo, sem ponto, até 72 caracteres>

<corpo opcional: o porquê, não o como>

Prompt: <NNN do registro em docs/vibe-coding/prompts/ ou id do nó no VibeLog>
Co-Authored-By: <IA que escreveu>
```

- **Tipos**: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`,
  `ci`, `perf`, `model` (treino, features ou avaliação; métricas no corpo).
- **Escopos**: `web`, `api`, `worker`, `data`, `features`, `model`, `ai`,
  `db`, `infra`, `vibelog`, `docs`. Dois escopos = dois commits.
- Mudança que quebra contrato ou esquema leva `!` (`feat(db)!: ...`).
- Mensagem em português; exemplo: `fix(api): corrige filtro por país em GET /alerts`.
- Um commit = uma mudança que faz sentido sozinha.
- **Branch**: `<tipo>/<escopo>-<descricao-curta>` (`feat/web-csv-ingestion`).
  Nada direto na `main`: PR, CI verde e revisão de um colega.
- Só commite ou dê push quando a pessoa pedir. Não misture no commit arquivos
  que já estavam modificados e não são da sua tarefa.

Antes do PR (o mesmo que o CI roda):

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest
cd web && pnpm lint && pnpm build
```

Testes da API usam um banco próprio terminado em `_test`
(`TEST_DATABASE_URL`) com `REQUIRE_TEST_DB=1`; sem isso eles são pulados e a
suíte passa verde sem ter testado a API.

## 6. Todo prompt de construção do projeto é registrado

O bootcamp avalia o processo de vibe-coding. Todo prompt que leva a uma
mudança no repositório ou a uma decisão do projeto precisa ficar registrado:
código, dados, modelo, infra, documentação ou decisão. Na dúvida, registre.
Pergunta solta que não muda nada não precisa.

Registre **três coisas**, cada uma no seu arquivo:

1. **O prompt da pessoa**, copiado literalmente (com os erros de digitação).
2. **Cada delegação** que a IA mandou para outra IA (Codex, agy, Cursor,
   outra conta), com o prompt inteiro.
3. **O resultado**: branch, commits, como foi feito, como foi verificado
   (comandos e números), o que o time precisa fazer depois e o que ficou em
   aberto.

### Onde

- Sempre em Markdown, em `docs/vibe-coding/prompts/NNN-<autor>-<assunto>.md`,
  versionado no mesmo PR da mudança. `<assunto>` em inglês, kebab-case.
- `NNN` é o próximo número livre. Confira na sua branch **e** na `main`:
  `git fetch && git ls-tree --name-only origin/main docs/vibe-coding/prompts/`.
  Se outro PR entrar antes com o mesmo número, renumere os seus e corrija o
  `pai` dos filhos.
- Quem tem a chave do VibeLog (`vibelog/.env.local`) também importa:
  `pnpm vibelog import-md ../docs/vibe-coding/prompts` a partir de `vibelog/`
  (regras em `vibelog/AGENTS.md`). Sem a chave, o Markdown basta.

### Cabeçalho

As chaves do cabeçalho ficam em português: o importador do VibeLog depende
delas.

```
---
id: 033
area: backend        # frontend | backend | ml | ia | dados | infra | docs | geral
autor: Pedro         # pessoa, ou a IA que escreveu a delegação/resultado
destino: Claude Code # quem recebeu o prompt
pai: null            # id do prompt que originou este; null no prompt raiz
data: 2026-11-05
tipo: resposta       # só nos arquivos de resultado
---
```

Exemplos reais: `027-pedro-code-in-english.md` (prompt da pessoa),
`028-claude-agy-backend.md` (delegação), `031-claude-code-in-english-result.md`
(resultado).

### O que nunca entra no registro

Senhas, chaves, tokens, conteúdo de `.env`, dados pessoais e números de conta
do SAML-D.

## 7. Fim de tarefa

- [ ] Experimento com o dataset ficou em `lab/<pessoa>/`, fora do git.
- [ ] Nenhuma regra da seção 2 quebrada; nomes novos no glossário.
- [ ] Lint e testes da seção 5 rodados e verdes (diga o que não rodou).
- [ ] Prompt, delegações e resultado registrados em `docs/vibe-coding/prompts/`.
- [ ] Commit no padrão, com `Prompt: NNN` no rodapé, se a pessoa pediu commit.
- [ ] Mudança de esquema avisada; `trash/` limpo.
