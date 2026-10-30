# Como contribuir

## Commits

Formato (Conventional Commits, em português):

```
<tipo>(<escopo>): <resumo no imperativo, minúsculo, sem ponto, até 72 caracteres>

<corpo opcional: o porquê da mudança, não o como>

Prompt: <id do nó no VibeLog ou arquivo em docs/vibe-coding/prompts/>
Co-Authored-By: <IA que escreveu, quando houver>
```

**Tipos**

| Tipo       | Quando                                              |
| ---------- | --------------------------------------------------- |
| `feat`     | funcionalidade nova                                 |
| `fix`      | correção de bug                                     |
| `refactor` | muda o código sem mudar o comportamento             |
| `test`     | só testes                                           |
| `docs`     | só documentação                                     |
| `style`    | formatação, sem mudança de lógica                   |
| `chore`    | dependências, configuração, scripts                 |
| `ci`       | GitHub Actions                                      |
| `perf`     | desempenho                                          |
| `model`    | treino, features ou avaliação do modelo (com métricas no corpo) |

**Escopos**: `web`, `api`, `worker`, `data`, `features`, `model`, `ai` (LLM/RAG),
`db`, `infra`, `vibelog`, `docs`. Mais de um escopo? Separe o commit.

**Exemplos**

```
feat(web): adiciona tela de detalhe do alerta com grafo de 2 saltos
fix(api): corrige filtro por país em GET /alerts
model(model): treina LightGBM v3 com janela de 4 semanas

PR-AUC 0,41 -> 0,47 no teste após 18/05/2023.
Prompt: 012
```

**Regras**

- Um commit = uma mudança que faz sentido sozinha. Não misture front, API e modelo.
- Nunca commite `.env`, chaves, `SAML-D.csv` nem arquivos de `models/`.
- Mudança de esquema (`db/init/002_tables.sql`) leva `!` e aviso no corpo:
  `feat(db)!: adiciona coluna channel em alerts` + "exige docker compose down -v".

## Branches

`<tipo>/<escopo>-<descricao-curta>`, ex.: `feat/web-csv-ingestion`, `fix/api-country-filter`.
Nada direto na `main`: abra PR, CI verde e um colega revisa.

## Antes do PR

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest
cd web && pnpm lint && pnpm build
```

## Vibe-coding

Todo trabalho feito com IA precisa estar registrado no VibeLog: o prompt da pessoa,
os prompts que a IA mandou para outras IAs e o resultado (commit + prints).
Quem registra são as próprias IAs, veja `vibelog/AGENTS.md`. Cite o nó no rodapé
`Prompt:` do commit.

Sem a chave do VibeLog (`vibelog/.env.local`)? Registre em Markdown, em
`docs/vibe-coding/prompts/NNN-<autor>-<assunto>.md`, com o próximo número livre e
este cabeçalho:

```
---
id: NNN
area: backend
autor: <pessoa ou IA>
destino: <IA que recebeu, se for delegação>
pai: <id do prompt que originou este, ou null>
data: AAAA-MM-DD
---
```

Um arquivo para cada prompt da pessoa, cada delegação e cada resultado. Quem tem a
chave importa com `pnpm vibelog import-md ../docs/vibe-coding/prompts` (a partir
de `vibelog/`).
