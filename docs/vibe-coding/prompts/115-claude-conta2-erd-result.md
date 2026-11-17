---
id: 115
area: docs
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 113
data: 2026-11-16
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do pedido do DER (prompt 113)

Pedido: "quando acabar ai faz os diagramas der do sistema tambem". Os diagramas ficam na mesma
branch dos BPMN (`docs/bpmn`), ainda sem commit.

## O que entrou

- `docs/erd/`: quatro diagramas entidade-relacionamento, cada um com o `.mmd` (fonte editável em
  Mermaid, que o GitHub desenha), o `.svg` e o `.png` (2x):
  1. `01-overview`: as 19 tabelas e as ligações, sem colunas;
  2. `02-transactions-model`: transações, contas, envios, gabarito, versões do modelo, notas e
     lotes semanais;
  3. `03-alerts-decisions`: alerta, evidências, parecer, decisão, comunicação e rótulo do analista;
  4. `04-platform`: as tabelas globais de `public`, a base do RAG e a auditoria.
- `docs/erd/README.md`: como ler (notação, linhas, cores), os dois níveis de schema, os vínculos
  sem constraint e o motivo de cada um, e as regras que o esquema garante.
- `docs/README.md` e a skill `fraudradar-overview` (as duas cópias) apontam para a pasta.

## Como foi feito

Um script descartável (fora do git) leu o DDL da `main` com `git show` (`db/init/002` a `005`,
incluindo o `ALTER` de `jobs.kind` no `004`). Ele tirou de lá colunas, tipos, chaves, `UNIQUE` e
os valores dos `CHECK ... IN`. Dessas informações saiu o `.mmd`. Assim, colunas e chaves não foram
digitadas à mão. Os rótulos das ligações, em português, e os vínculos lógicos foram escritos à
mão. O Mermaid 12.3.0, rodando no Chromium, exportou o SVG e o PNG.

## Decisões (técnicas, reversíveis)

- **Mermaid** em vez de DBML ou PlantUML: é texto no repositório, o GitHub mostra sem
  ferramenta, e o SVG sai sem `foreignObject`, então abre em qualquer visualizador.
- **Pasta `docs/erd/`**, em inglês (regra do `AGENTS.md`). O nome "DER" fica nos textos.
- **Quatro diagramas em vez de um:** com as colunas, as 19 tabelas não cabem legíveis num slide.
  A visão geral fica sem colunas.
- **Notação:**
  - linha cheia para o relacionamento identificador e tracejada para o não identificador;
  - "(sem FK)" no rótulo para o vínculo que o banco não declara;
  - o motivo de cada vínculo sem FK vem do comentário do DDL. Onde o DDL não diz, o README só
    diz que a FK não foi declarada.
- **`datasets` para `processing_settings`** é exatamente um para um por causa do gatilho do
  `004`; o DDL sozinho mostraria zero ou um.
- **Cores:**
  - `ground_truth` em vermelho: o modelo nunca lê essa tabela;
  - `analyst_labels` em verde: o retorno dos analistas, separado do gabarito.

## Verificação

- O Mermaid renderizou os quatro sem erro. Na primeira tentativa, a visão geral falhou pelos
  dois-pontos no título; o título passou a ir entre aspas.
- Conferi os quatro PNG olhando as imagens:
  - nomes longos quebravam no meio, e a largura mínima das caixas subiu;
  - o diagrama 3 ficava com 3 mil pixels de largura e passou a ser vertical.
- As 19 tabelas lidas batem com os `CREATE TABLE` do `db/init`.

## Em aberto

- Commit e PR esperam o Pedro, junto com os BPMN.
- O script descartável (`trash/der-tools/`) sai quando o Pedro aprovar os diagramas.
