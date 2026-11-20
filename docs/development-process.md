# Etapas do desenvolvimento

Como o FraudRadar PLD foi construído, do repositório vazio à entrega. As datas e os números de PR
vêm do histórico do GitHub; cada etapa aponta para o que ficou no repositório. O registro de
cada prompt usado está em [`vibe-coding/prompts/`](vibe-coding/prompts/).

## 1. Problema e escolha da base (outubro de 2026)

- **Tema**: prevenção à lavagem de dinheiro (PLD). Bancos precisam monitorar transações,
  separar o que é suspeito e comunicar ao COAF (Lei 9.613/1998 e Circular BCB 3.978/2020). O
  gargalo real é o analista: alerta demais, a maioria falso positivo.
- **Base**: o **SAML-D**, dataset sintético público com 9,5 milhões de transações, 28
  tipologias (11 normais e 17 de lavagem) e o gabarito de cada transação. Sintético porque
  transação bancária real não pode ser usada.
- **Decisão de produto**: o sistema prioriza alertas e explica por quê; quem decide é o
  analista. A IA redige e sugere, nunca decide nem afirma crime.
- Requisitos do bootcamp em [`project-requirements.md`](project-requirements.md).

## 2. Fundação do monorepo (23 a 26/10)

- Um repositório só com o pacote Python compartilhado (`src/fraudradar`), a API (`api/`), o
  worker (`worker/`), o front (`web/`), o banco (`db/`) e a infraestrutura (`infra/`).
- Python 3.12 com `uv` e um `uv.lock`; Next.js com pnpm; Postgres 17 com pgvector no Docker.
- Regras do time em [`../AGENTS.md`](../AGENTS.md) e [`../CONTRIBUTING.md`](../CONTRIBUTING.md):
  features e score só em `src/fraudradar`, o modelo nunca lê o gabarito, o LLM nunca recebe
  número de conta, nada de dados, modelos ou `.env` no Git.
- Primeira versão do front com login (Supabase Auth), visão geral, ingestão e assistente.

## 3. Tratamento e análise dos dados (frente 1)

- Carga do CSV com tipos compactos (o arquivo tem 1 GB), limpeza dos nomes das tipologias e
  conversão das datas: `src/fraudradar/data/saml_d.py`, notebook
  [`01_tratamento`](../notebooks/01_tratamento.ipynb).
- Análise exploratória: distribuição por tipologia, país, moeda e tipo de pagamento, desbalanço
  (cerca de 0,1% de lavagem): notebook [`02_eda`](../notebooks/02_eda.ipynb).
- Esquema do banco em `db/init/` (transações, gabarito separado em `ground_truth`, contas,
  scores, alertas, evidências, decisões, auditoria). DER em [`erd/`](erd/README.md).
- Regras de cenário em SQL, determinísticas e calibradas no SAML-D (`db/rules/`, R-001 a R-005).

## 4. API, ingestão e nomes em inglês (PRs #1 a #3, 30/10)

- API FastAPI com a fila de alertas, o detalhe, as decisões, o replay e o monitoramento (#1).
- Ingestão de transações por CSV e avulsa, validada linha a linha, tudo ou nada (#2).
- Todo o código, as pastas, as tabelas e as rotas passaram para inglês (#3); o mapa entre o
  vocabulário do time e o código está em [`glossary.md`](glossary.md).

## 5. Modelo de Machine Learning (frente 2, PRs #7 e #8, 05/11)

- Experimentos no `lab/` (rascunho fora do Git): regras de cenário, regressão logística, GRU,
  Isolation Forest e LightGBM.
- Escolhido o **LightGBM**, com 21 variáveis calculadas só com o passado das contas
  (`src/fraudradar/features/history.py`), divisão no tempo (nunca embaralhada) e fila semanal
  por conta. No teste: PR-AUC 0,896; a fila com corte pega 95,1% das contas lavadoras, com
  precisão de 99,0% e 2,2 inocentes por semana.
- Explicação de cada alerta pela contribuição das variáveis (o mesmo cálculo do SHAP) e
  segmentos de contas com K-Means.
- Detalhes, números e comparações em [`model.md`](model.md); notebook
  [`03_modelo`](../notebooks/03_modelo.ipynb).

## 6. Worker em lote (PR #10, 06/11)

- `python -m worker load | batch | backfill | replay`: carrega o SAML-D no Postgres e, a cada
  semana, grava scores, alertas, evidências, segmentos e métricas.
- Garantias: só processa semanas fora do treino, o score é o mesmo do treino, o gabarito só é
  lido depois de a fila estar gravada, e o trabalho do analista nunca é apagado.

## 7. Front e experiência do analista (PRs #4 a #6 e #12 a #15, 05 a 11/11)

- Barra lateral, fila com busca e filtros, detalhe do alerta com grafo de 2 saltos,
  comunicação ao COAF dentro do alerta, temas personalizáveis.
- Nota de risco mostrada com a posição na fila, sem porcentagem (o score não é probabilidade).

## 8. Plataforma: processamento contínuo e retorno dos analistas (PRs #16 e #17, 12 e 13/11)

- Fila de trabalhos no banco e `worker serve`, que processa por intervalo ou sob demanda; vários
  conjuntos de dados isolados; conexão com bancos Postgres externos; simulação de transações.
- Retreino por conjunto pela tela, com trava de promoção (a versão nova só vira ativa se não
  piorar).
- Retorno dos analistas: motivo obrigatório ao arquivar, rótulos em `analyst_labels`, amostra
  de controle fora da fila e o recall fora das telas de operação (as telas não usam o gabarito).
  Desenho e resultados em [`analyst-feedback.md`](analyst-feedback.md) e
  [`external-data.md`](external-data.md).

## 9. Infraestrutura (PRs #11, #22 e #23)

- Docker Compose para o dia a dia e **Terraform** (provider `kreuzwerker/docker`) para subir os
  mesmos containers de forma automatizada: [`../infra/terraform/README.md`](../infra/terraform/README.md).
- Produção: API numa VM da Oracle Cloud (`infra/terraform-oci`, `infra/docker-compose.prod.yml`)
  e front na Vercel, publicado a cada merge na `main`.
- CI no GitHub Actions: lint e testes do Python (com Postgres), lint, testes e build do front, e
  `terraform fmt` e `validate`.

## 10. Idiomas (PR #18, 16/11)

- Front em português (padrão) e inglês, com o seletor no cabeçalho. O servidor manda códigos de
  erro e o front traduz.

## 11. IA generativa com base de conhecimento (frente 3, PRs #19 a #32, 16 a 18/11)

- **Base de conhecimento**: a Lei 9.613/1998 e a Circular BCB 3.978/2020 em `rag/snapshots/`,
  com hash e status de revisão; `python -m worker rag-load` divide em trechos, gera os vetores
  (`multilingual-e5-small`) e grava em `rag_documents` (pgvector).
- **Chat jurídico** (#19, #20, #22, #26): busca híbrida (texto e vetor), resposta do Gemini com
  citações conferidas pelo servidor.
- **Parecer do alerta** (#25): resumo da evidência sem número de conta, busca na base, rascunho
  com citações e tipologia sugerida, gravado em `assessments` e na auditoria.
- **Roteamento do chat** (#29) entre conversa, conceito de PLD, lei e fora do escopo; **apoio à
  decisão** no alerta (#30) com indícios a favor e contra, marcado como sugestão.
- **Assistente com ferramentas** (#31, #32): consulta a fila e as semanas só para leitura,
  sugere links das telas, guarda o histórico das conversas e troca de modelo Gemini quando um
  está indisponível. Desenho em [`chat-routing.md`](chat-routing.md); avaliação no notebook
  [`04_avaliacao_llm`](../notebooks/04_avaliacao_llm.ipynb).

## 12. Fechamento (PRs #21, #33 e #34, 17 a 19/11)

- **BPMN** do processo (monitoramento, processamento do período e retreino) em
  [`bpmn/`](bpmn/README.md) e DER atualizado.
- Regras de cenário, notebooks oficiais executados sobre `src/fraudradar` e a Circular 3.978 na
  base do RAG, ainda pendente de revisão humana.
- Ajustes de experiência no Monitoramento e nas Configurações.

## Como a IA foi usada (vibe-coding)

O time usou assistentes de código (Claude Code, Codex, Antigravity e Cursor) para escrever e
revisar. Cada prompt de uma pessoa, cada delegação de uma IA para outra e cada resultado viraram
um arquivo em [`vibe-coding/prompts/`](vibe-coding/prompts/), no formato de
[`../CONTRIBUTING.md`](../CONTRIBUTING.md#vibe-coding). As regras que as IAs seguem neste
repositório estão em `AGENTS.md` e nas skills de `.agents/skills/`.

## O que ficou de fora

- A revisão humana do texto da Circular BCB 3.978/2020: enquanto ela não for aprovada, o chat
  usa só a Lei 9.613.
- O modelo não prevê a tipologia; ela vem do parecer da IA.
- O processamento é em lote semanal, não em tempo real.
