---
id: 117
area: geral
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 116
data: 2026-11-16
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 116: BPMN e DER no PR #21, pendências do RAG no PR #22

## BPMN e DER (PR #21)

A `docs/bpmn` foi refeita sobre a `main` atual (`8f89305`), em dois commits:

- os BPMN, com os registros 111 e 112;
- o DER, com o registro 115. O pedido do DER é o 113, que já estava na `main`.

O DER já tinha `jobs.message_code` e `message_params`, que vieram do PR #18. O BPMN continua certo
depois do PR #19: o parecer do alerta segue planejado (responde 503), e o chat jurídico é outra
tela. Só documentação.

## Pendências do RAG (PR #22, branch `fix/ai-legal-chat-gaps`)

| Achado do 114 | O que mudou |
|---|---|
| Sem comando para carregar a lei em `rag_documents` | `python -m worker rag-load` |
| `/chat` responde 500 sem o Gemini configurado | 503 `ai.not_configured`, checado antes da busca |
| OCID da tenancy como padrão no `vars.tf` | `compartment_ocid` sem padrão; `terraform.tfvars.example` |
| PR #19 sem registro de prompt | não corrigido: só o Victor sabe o que pediu à IA dele |

### `rag-load`

- `worker/rag.py` lê os arquivos e abre a transação.
- `load_legal_snapshot` (`src/fraudradar/ai/legal_ingestion.py`) faz o resto:
  - valida com o `prepare_legal_snapshot` do Victor;
  - grava com o corte que essa função mediu (900/120). O `ingest_document` usaria 1000/150, e a
    contagem de trechos não bateria com a esperada;
  - não faz nada quando a base já bate com o snapshot;
  - se mudaram o status da revisão, o modelo de embeddings ou a contagem de trechos, apaga os
    trechos daquele snapshot e grava de novo.
- Todos os arquivos vão numa transação: se um falhar, nada fica na base.
- No compose, o worker monta `rag/`, e o volume `hf-cache` guarda o modelo de embeddings para a
  api e o worker.

### Achados novos

- Resposta do Gemini vazia ou sem citação conferível também dava 500. Agora dá 502
  `ai.provider_failed`.
- O modelo de embeddings, de 471 MB, era baixado na primeira pergunta ao chat. Agora fica no volume
  `hf-cache`.
- No Terraform local, a API não recebe `LLM_MODEL` e não monta `rag/`. Ficou na tabela de diferenças
  do `infra/terraform/README.md`, sem correção: hoje ninguém entra no app por esse caminho.
- Com "penalidades administrativas", a busca híbrida pôs o art. 4 à frente do art. 12. Os pesos
  dela são experimentais; isso é da frente 3.

## Decisões (técnicas, reversíveis)

- **Comando no worker, ao lado do `load` do SAML-D.** Não entrou na API nem na subida da API,
  porque gravar no banco ao subir a API pode dar corrida com mais de uma instância. A imagem do
  worker já tem o grupo `ai`.
- **Snapshot que mudou é gravado de novo por inteiro.** Atualizar campo a campo daria mais código
  para pouco ganho: são 58 trechos, gravados em 12 s com o modelo em cache.
- **Checagem do Gemini antes da busca.** Sem ela, um servidor sem o LLM configurado carregaria o
  modelo de 471 MB para depois falhar. A checagem só roda com o gerador real; os testes que
  injetam gerador não passam por ela.
- **502 para resposta sem citação**, e não mostrar as fontes sem a explicação, como o Victor faz
  quando o Gemini responde 503. Mudar o comportamento do chat é decisão da frente 3. O 502 só
  troca o 500 pelo código que a rota já usava para falha do provedor.
- **As exceções novas são subclasses de `ValueError`.** Os testes e os chamadores que capturavam
  `ValueError` seguem iguais.
- **O OCID da imagem fica no `vars.tf`.** Pelo README da pasta, é a imagem do Ubuntu 24.04 da
  Oracle, e não um recurso da conta. Os OCIDs de IP, VNIC e DHCP do `core.tf` também ficam: são
  recursos que o Resource Manager exportou, e tirá-los seria refazer a exportação.

## Verificação

- **Suíte Python:** `pytest` com o Postgres local e `REQUIRE_TEST_DB=1` deu 686 passaram, 0
  pulados e 0 falhas. Antes eram 661; os 25 novos rodaram.
- **Testes novos:**
  - `tests/test_legal_chat_config.py` (18, sem banco);
  - `tests/worker/test_worker_rag_load.py` (7, com banco e embeddings falsos). O último usa o
    snapshot de verdade e chama o `POST /chat`: 503 com a base vazia e 200 com fontes depois do
    `rag-load`.
- **Controles negativos:** cinco mutações deixaram o teste certo vermelho, cada uma pelo motivo
  certo:
  1. sem o corte do snapshot;
  2. carga que nunca deixa a base como está;
  3. status da revisão ignorado;
  4. uma transação por arquivo;
  5. sem a checagem antes da busca.
- **Modelo e5 de verdade**, num banco descartável que depois foi apagado:
  - 28 artigos em 58 trechos: 171 s com o download do modelo e 12 s com ele em cache;
  - a segunda rodada não faz nada;
  - a busca trouxe o art. 12 para "penalidades administrativas", o art. 11 para "comunicar
    operações suspeitas ao COAF" e o art. 1 para "art. 1".
- **Docker:**
  - a imagem do worker foi reconstruída;
  - `docker compose run --rm worker rag-load` gravou os 58 trechos;
  - o volume `hf-cache` ficou com 471 MB;
  - um container novo carregou o modelo com `HF_HUB_OFFLINE=1`.
- **Front e Terraform:** `pnpm test` (web) deu 84 de 84, inclusive a tradução de
  `ai.not_configured`. `terraform fmt -check` passou em `infra/terraform-oci`.

Não verificado:

- a imagem da api não foi reconstruída;
- o chat com uma chave real do Gemini;
- o servidor da Oracle (a rede daqui bloqueia o domínio).

## Em aberto

- **Para o Victor:**
  - registros de prompt do PR #19;
  - `compartment_ocid` no `terraform.tfvars` dele;
  - confirmar que o OCID da imagem é público;
  - rodar o `rag-load` no servidor depois do merge.
- **Histórico do git:** o OCID antigo da tenancy continua lá. Não é credencial, e reescrever o
  histórico de um repositório compartilhado não compensa.
- **Perguntas ainda abertas para o Pedro:**
  - como os avaliadores vão fazer login;
  - se as branches do Victor sem PR (`victor` e `audit/reproducao-lightgbm-v1`) entram.
- **Merge dos PRs #21 e #22:** pelo `CONTRIBUTING.md`, um colega revisa.
