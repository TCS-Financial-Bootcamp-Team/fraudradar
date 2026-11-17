# Terraform do FraudRadar PLD

Este documento explica a infraestrutura que o Terraform sobe: o que é cada peça, como elas
conversam, o que faz cada arquivo, recurso e variável, e como usar. Vale o código de
`infra/terraform/`. Se os dois divergirem, corrija este documento.

## 1. O que é e por que existe

O bootcamp pede "infraestrutura automatizada com Terraform, podendo rodar localmente ou na
nuvem" (`docs/project-requirements.md`). O FraudRadar roda **localmente, sem nuvem**: o
Terraform usa o provider `kreuzwerker/docker` para criar no Docker da própria máquina os
mesmos containers que o Docker Compose cria.

- **Compose** (`compose.yaml` na raiz, que inclui `infra/docker-compose.yml`) é o caminho do
  dia a dia e da demo.
- **Terraform** é a mesma infraestrutura descrita como código declarativo: você diz o estado
  final ("quero um banco, uma API e um front, ligados nesta rede"), e o Terraform calcula o que
  falta criar, mudar ou apagar para chegar lá.

Os dois **não rodam juntos**: os nomes não colidem (o Terraform põe o prefixo `fraudradar-tf`
em tudo), mas as portas 5432, 8000 e 3000 colidem.

## 2. O sistema que ele sobe

```
                 sua máquina (localhost)
   navegador ─────────────┬──────────────────────────────┐
     │ :3000              │ :8000                        │ :5432 (opcional:
     ▼                    ▼                              │  DBeaver, worker)
 ┌──────────────┐   ┌──────────────┐               ┌─────┴────────┐
 │ fraudradar-  │   │ fraudradar-  │  SQL (porta   │ fraudradar-  │
 │ tf-web       │   │ tf-api       │──5432 interna)▶ tf-db        │
 │ Next.js      │   │ FastAPI      │   host "db"   │ Postgres 17  │
 └──────────────┘   └──────┬───────┘               │ + pgvector   │
                           │ lê                    └──────┬───────┘
                           ▼                              │ grava em
                     models/ (só leitura)          volume fraudradar-tf-pgdata
        └──────────── rede fraudradar-tf-network ─────────┘

 worker (fora do Terraform): roda na máquina e grava no banco pela porta 5432
```

| Peça         | O que faz no sistema                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **db**       | Postgres 17 com a extensão `pgvector` (os embeddings do RAG). Guarda transações, contas, scores, alertas, evidências, decisões, pareceres, relatórios e o log de auditoria. Na primeira vez, cria as tabelas com os scripts de `db/init/`                                         |
| **api**      | FastAPI. É a única porta de entrada dos dados: lê do banco a fila de alertas, o detalhe, o grafo e o monitoramento, grava as decisões do analista, recebe a ingestão de transações e libera semanas no replay. Valida o login pelo Supabase e é a única que guarda a chave do LLM |
| **web**      | Next.js, as telas do analista. Roda no navegador e chama a API direto em `http://localhost:8000`, com o token do login do Supabase                                                                                                                                                |
| **worker**   | Não é um serviço, é um job em lote: carrega o SAML-D, calcula as variáveis, dá score com o LightGBM e monta a fila semanal. Roda quando alguém manda (ver a seção 8)                                                                                                              |
| **Supabase** | Fica fora do Docker, na nuvem do Supabase. Só cuida do login dos analistas                                                                                                                                                                                                        |

O fluxo completo: o worker grava a fila da semana no banco → o analista entra no front → o front
pede a fila para a API → a API lê do banco → o analista decide → a API grava a decisão e o log.

## 3. Como o Terraform trabalha aqui

1. **`terraform init`** baixa o provider Docker (versão travada em `.terraform.lock.hcl`) para a
   pasta `.terraform/`.
2. **`terraform plan`** compara o código com o que já existe e mostra o que vai criar (`+`),
   mudar (`~`) ou apagar e recriar (`-/+`). Não mexe em nada.
3. **`terraform apply`** executa o plano: monta as imagens, cria rede, volume e containers, na
   ordem das dependências (rede e volume → banco → API → front).
4. **`terraform.tfstate`** é o arquivo onde o Terraform anota o que criou. É local, fica só na
   máquina de quem rodou o `apply` e está fora do git. Apagou o state? O Terraform "esquece"
   os containers e tenta criá-los de novo (e falha porque os nomes já existem): apague os
   containers à mão com `docker rm -f`.
5. **`terraform destroy`** apaga tudo o que está no state, **inclusive o volume do banco**.

## 4. Os arquivos

| Arquivo               | O quê                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `versions.tf`         | Exige Terraform `>= 1.6` e o provider `kreuzwerker/docker` `~> 3.0` (qualquer 3.x). Configura o provider com `host = var.docker_host` |
| `variables.tf`        | As entradas que dá para mudar sem mexer no código (seção 6)                                                                           |
| `main.tf`             | Tudo o que é criado: rede, volume, imagens e containers (seção 5)                                                                     |
| `outputs.tf`          | O que o Terraform mostra no fim do `apply` (seção 7)                                                                                  |
| `.terraform.lock.hcl` | A versão exata do provider que o time usa. **Vai para o git**, para todo mundo usar a mesma                                           |
| `README.md`           | Este documento                                                                                                                        |

Ficam fora do git (`.gitignore`): `.terraform/`, `*.tfstate*` e `*.tfvars`. Só um
`*.tfvars.example` pode entrar.

## 5. Cada recurso do `main.tf`

### `locals`

| Nome           | Valor                                                             | Para quê                                                                                                                                          |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`         | caminho absoluto da raiz do repositório (`infra/terraform/../..`) | base de todo caminho: Dockerfiles, `db/init`, `models/`                                                                                           |
| `database_url` | `postgresql+psycopg://<usuário>:<senha>@db:5432/<banco>`          | endereço do banco **visto de dentro da rede**: o host é `db` (o apelido do container) e a porta é a interna, 5432, mesmo que `db_port` seja outra |

### `moved` (`docker_network.rede` → `docker_network.network`)

Quando os nomes do código passaram para inglês, o recurso da rede mudou de nome. O `moved`
avisa o Terraform que é o mesmo recurso, para ele só renomear no state em vez de apagar e
criar a rede de novo. Renomeou outro recurso? Acrescente outro `moved`.

### `docker_network.network` → `fraudradar-tf-network`

Rede Docker própria. Dentro dela, cada container acha o outro pelo apelido (`db`, `api`,
`web`), como no Compose.

### `docker_volume.pgdata` → `fraudradar-tf-pgdata`

Disco do banco. Sobrevive a parar, recriar ou atualizar o container: os dados só somem num
`destroy` ou se o volume for apagado à mão.

### `docker_image.db` → `pgvector/pgvector:pg17`

Imagem pronta do Postgres 17 com o `pgvector`, baixada do Docker Hub. `keep_locally = true`:
o `destroy` não apaga a imagem, para o próximo `apply` não baixar de novo.

### `docker_image.api` → `fraudradar-tf-api:local`

Montada a partir de `api/Dockerfile`, com a raiz do repositório como contexto. A imagem tem
Python 3.12, o `uv` e só o grupo de dependências `api` (sem `torch` nem `lightgbm` de treino),
copia `src/`, `api/` e `worker/` e sobe o `uvicorn` na porta 8000.

`triggers.code` guarda um hash de todo `.py` de `api/`, `src/` e `worker/`, e `triggers.lock`
o hash do `uv.lock`. Mudou um desses arquivos? O próximo `apply` monta a imagem de novo e
recria o container. **Mudança só no `Dockerfile` não dispara**: use
`terraform apply -replace=docker_image.api`.

### `docker_image.web` → `fraudradar-tf-web:local`

Montada a partir de `web/Dockerfile`, em três etapas: instala os pacotes com `pnpm`, roda o
`pnpm build` e copia só o servidor pronto (`standalone`) para uma imagem final pequena, que
roda como o usuário `node` na porta 3000.

Recebe `NEXT_PUBLIC_API_URL = http://localhost:<api_port>` como build arg. Tudo o que começa
com `NEXT_PUBLIC_` é **embutido no código na hora do build**, porque roda no navegador: trocar
depois, no container, não adianta.

`triggers` guarda o hash de `web/src/**` e do `pnpm-lock.yaml`. Mudança em `web/public`,
`next.config.*` ou no `Dockerfile` não dispara: use `terraform apply -replace=docker_image.web`.

### `docker_container.db` → `fraudradar-tf-db`

| Configuração                        | O que faz                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restart = "unless-stopped"`        | Volta sozinho se cair ou se o Docker reiniciar, a não ser que alguém pare                                                                                                    |
| `env`                               | `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`: o Postgres cria o usuário e o banco na primeira vez                                                                    |
| `networks_advanced`                 | Entra na rede com o apelido `db`                                                                                                                                             |
| `ports`                             | Publica a 5432 interna na `db_port` da máquina                                                                                                                               |
| `volumes` (1)                       | O volume `pgdata` em `/var/lib/postgresql/data`, onde o Postgres guarda os dados                                                                                             |
| `volumes` (2)                       | `db/init/` em `/docker-entrypoint-initdb.d`, só leitura. **Só roda quando o volume está vazio**: `001_extensions.sql` liga o `pgvector`, `002_tables.sql` cria as 14 tabelas |
| `healthcheck`                       | `pg_isready` a cada 5 s, até 20 tentativas                                                                                                                                   |
| `wait = true`, `wait_timeout = 120` | O `apply` espera o banco ficar saudável (até 2 min) antes de criar a API                                                                                                     |

### `docker_container.api` → `fraudradar-tf-api`

| Configuração        | O que faz                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`               | `DATABASE_URL` (o do `locals`), `MODEL_DIR=/app/models`, `LLM_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` e `SUPABASE_URL`                 |
| `networks_advanced` | Entra na rede com o apelido `api`                                                                                                               |
| `ports`             | Publica a 8000 interna na `api_port`                                                                                                            |
| `volumes`           | `models/` da máquina em `/app/models`, só leitura: a API carrega o LightGBM treinado (`lightgbm_model.txt`) sem que ele esteja dentro da imagem |
| `depends_on`        | Só é criada depois do banco (que já esperou ficar saudável)                                                                                     |

O que a API não recebe fica com o padrão de `src/fraudradar/config.py`: `MODEL_FILE =
lightgbm_model.txt`, `CORS_ORIGINS = ["http://localhost:3000"]`, `AUTH_DISABLED = false`.

### `docker_container.web` → `fraudradar-tf-web`

Entra na rede com o apelido `web`, publica a 3000 na `web_port` e só é criado depois da API.
Não tem variáveis de ambiente: tudo o que ele precisa foi embutido no build.

## 6. Variáveis

Mude com `-var 'nome=valor'`, num `terraform.tfvars` (fora do git) ou com a variável de
ambiente `TF_VAR_<nome>`. Para chave, prefira `TF_VAR_`, que não fica no histórico do terminal
nem em arquivo.

| Variável            | Tipo   | Padrão          | Sensível | Para quê                                                                                                                        |
| ------------------- | ------ | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `docker_host`       | string | `null`          |          | Endereço do Docker. No Windows: `npipe:////./pipe/docker_engine`. No Linux e no macOS, deixe vazio                              |
| `prefix`            | string | `fraudradar-tf` |          | Início do nome de todos os recursos                                                                                             |
| `postgres_user`     | string | `fraudradar`    |          | Usuário do banco                                                                                                                |
| `postgres_password` | string | `fraudradar`    | sim      | Senha do banco. Serve só para uso local                                                                                         |
| `postgres_db`       | string | `fraudradar`    |          | Nome do banco                                                                                                                   |
| `db_port`           | number | `5432`          |          | Porta do banco na máquina                                                                                                       |
| `api_port`          | number | `8000`          |          | Porta da API na máquina. Também vai para o build do front                                                                       |
| `web_port`          | number | `3000`          |          | Porta do front na máquina. Trocar exige mudar o CORS da API (seção 9)                                                           |
| `llm_provider`      | string | `gemini`        |          | `gemini` (o do time), `openai` ou `anthropic`                                                                                   |
| `supabase_url`      | string | `""`            |          | URL do projeto Supabase. A API busca nela a chave pública para validar o login. Vazio: a API recusa toda requisição autenticada |
| `gemini_api_key`    | string | `""`            | sim      | Chave do Gemini (Google AI Studio), só na API                                                                                   |
| `openai_api_key`    | string | `""`            | sim      | Chave do LLM, só na API                                                                                                         |
| `anthropic_api_key` | string | `""`            | sim      | Chave do LLM, só na API                                                                                                         |

`sensitive = true` esconde o valor no `plan` e no `apply`, mas ele fica em texto aberto no
`terraform.tfstate`. Por isso o state nunca vai para o git.

## 7. Saídas

| Saída          | Valor padrão                                  |
| -------------- | --------------------------------------------- |
| `web_url`      | `http://localhost:3000`                       |
| `api_url`      | `http://localhost:8000`                       |
| `api_docs_url` | `http://localhost:8000/docs` (Swagger da API) |
| `network`      | `fraudradar-tf-network`                       |

Para ver de novo: `terraform output`.

## 8. Passo a passo

Pré-requisitos: Docker rodando (no Docker Desktop, pelo menos 8 GB de memória para o worker),
Terraform 1.6 ou mais novo, o modelo em `models/lightgbm_model.txt` e o `data/SAML-D.csv`.

```bash
# 1. Pare o Compose, se estiver no ar (na raiz)
docker compose down

# 2. Suba a infraestrutura
cd infra/terraform
terraform init
terraform apply -var 'docker_host=npipe:////./pipe/docker_engine'   # Windows
#   confira o plano e responda "yes"

# 3. Carregue os dados e gere as filas (na raiz, pela máquina)
cd ../..
uv run python -m worker load       # SAML-D para o banco
uv run python -m worker backfill   # as 14 semanas do teste

# 4. Abra http://localhost:3000, entre e libere as semanas no app
```

O worker roda pela máquina porque o Terraform não o cria. Isso inclui o executor contínuo
`python -m worker serve` dos trabalhos em segundo plano: ele existe no Compose como
`worker-serve`, mas ainda não está descrito nos arquivos `.tf`. O `.env` da raiz já aponta o
`DATABASE_URL` para `localhost:5432`, que é a porta publicada do banco do Terraform. O
`docker compose run worker` não serve: ele entra na rede do Compose, onde esse banco não existe.

Para desligar sem perder dados: `docker stop fraudradar-tf-web fraudradar-tf-api fraudradar-tf-db`
(e `docker start` para voltar). Para apagar tudo: `terraform destroy` com o mesmo `-var`.

## 9. Diferenças em relação ao Compose (16/11/2026)

O certo é os dois subirem o mesmo sistema. Hoje não sobem:

| No Terraform                                                                                      | Efeito                                                                                                                                     | Correção                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| A imagem web **não recebe** `NEXT_PUBLIC_SUPABASE_URL` nem `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sem a configuração do Supabase, o front manda toda tela para `/login` e o login não funciona. **Hoje ninguém entra no app pelo Terraform** | Duas variáveis novas e os `build_args`, como no Compose |
| A API não recebe `CORS_ORIGINS`                                                                   | O CORS libera só `http://localhost:3000`. Com outra `web_port`, o navegador bloqueia as chamadas                                           | Passar `CORS_ORIGINS` montado a partir da `web_port`    |
| A API não tem healthcheck                                                                         | O front pode subir antes de a API estar pronta                                                                                             | Healthcheck no `/health` e `wait = true`                |
| A API não lê o `.env`                                                                             | `MODEL_FILE`, `AUTH_DISABLED` e `EMBEDDING_MODEL` ficam com o padrão                                                                       | Variáveis próprias, se precisar                         |
| Sem worker e sem executor de trabalhos                                                            | Ver a seção 8                                                                                                                              | Rodar `worker serve` pela máquina; ainda não está no Terraform |
| A API não recebe `LLM_MODEL` e não monta `rag/` nem o cache do modelo de embeddings               | O chat jurídico responde 503: `ai.not_configured` sem o modelo e `ai.no_legal_sources` sem o snapshot da lei                               | Variável `llm_model` e os volumes de `rag/` e `hf-cache`, como no Compose. A base vem do `worker rag-load` pela máquina |

## 10. Problemas comuns

| Sintoma                                          | Causa e saída                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `port is already allocated`                      | O Compose (ou outro Postgres) está usando a porta. `docker compose down`, ou mude `db_port`/`api_port`/`web_port`        |
| `Cannot connect to the Docker daemon` no Windows | Falta `-var 'docker_host=npipe:////./pipe/docker_engine'`, ou o Docker Desktop está fechado                              |
| Mudei o `002_tables.sql` e nada mudou            | Os scripts de `db/init/` só rodam com volume vazio. `terraform destroy` e `apply` (apaga o banco)                        |
| Mudei o código e o container continua velho      | O arquivo está fora dos `triggers` (seção 5). `terraform apply -replace=docker_image.api` (ou `.web`)                    |
| `Error: container name already in use`           | O state não conhece um container que existe (state apagado ou de outra máquina). `docker rm -f <nome>` e `apply` de novo |
| `/health` com `"status":"degraded"`              | Sem chave de LLM. O resto funciona; o parecer da IA responde 503                                                         |

## 11. O que o CI confere

O job `terraform` de `.github/workflows/ci.yml` roda, em `infra/terraform/`:
`terraform fmt -check -recursive`, `terraform init -backend=false` e `terraform validate`. Ele
prova que o código está formatado e é válido, **não** que o `apply` funciona. Quem mudar um
`.tf` roda um `plan`, ou um `apply` seguido de `destroy`, na própria máquina.
