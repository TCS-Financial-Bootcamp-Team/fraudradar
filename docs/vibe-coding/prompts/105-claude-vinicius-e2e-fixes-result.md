---
id: 105
area: backend
autor: Claude Code (PC do Vinicius)
destino: Pedro
pai: 104
data: 2026-11-11
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 104: os quatro defeitos do teste de ponta a ponta

Branch `feat/external-datasets`. O Vinicius anexou o 104 sem texto, e o Claude dele corrigiu os
quatro defeitos, com testes, em cinco commits, mais o deste registro. Não houve rebase nem
force-push.

## O que mudou

| Defeito | Commits | O que mudou |
|---|---|---|
| 1. Simulador irreal | `6871489` | o tráfego normal repete ligações reais em vez de sortear pares |
| 2. Trava do treino no conjunto errado | `fb53713`, `53b36ad` | a ficha grava o conjunto do treino, e a trava só vale nele |
| 3. Cópia da base sem aviso | `bd47f09` | a sugestão diz que parece a mesma base e que importar duplicaria |
| 4. Resumo do gabarito em banco antigo | `2011f17` | `python -m worker labels [--dataset SLUG]` |

1. **Simulador** (`src/fraudradar/data/simulation.py`). Cada transação simulada copia uma
   transação real sorteada da amostra recente (as 5.000 mais novas, como antes): o par, o meio,
   as moedas e os países. O par frequente sai mais. O valor é o da transação real vezes um fator
   log-normal de cerca de 10%. Só o fan-out opcional cria pares novos, e ele continua como
   antes. A ingestão continua com `source = 'simulation'`, e o gabarito não é gravado.
2. **Trava do treino.** `train_version` grava `training_dataset` na ficha: `saml-d` no oficial,
   o slug no retreino (`worker/train_job.py`). A ficha sem o campo conta como a do oficial. A
   trava (`worker/weeks.py`, `guards_training_period`) só vale nesse conjunto. Nos outros,
   `batch`, `backfill`, `replay` e o processamento contínuo aceitam toda semana, e o histórico
   das variáveis começa na primeira transação do conjunto, não no `history_start` da ficha.
3. **Compatibilidade** (`suggest`). Com 99% ou mais das contas da amostra no conjunto e as
   datas cruzando as dele, a mensagem passa a dizer: "parece ser a mesma base já carregada, e
   importar duplicaria transações. Confira a origem; se for mesmo outra base, importe como
   conjunto separado." A relação pré-selecionada continua `new_dataset`, e quem decide é a
   pessoa.
4. **`python -m worker labels`** (`worker/labels.py`, `refresh_registry`). Mede e grava
   `labeled_weeks` e `has_laundering` de todos os conjuntos registrados, ou de um só com
   `--dataset`. Cada conjunto é gravado numa transação própria. O README explica quando rodar,
   na seção "Como rodar", junto do aviso de recriar o banco, e na tabela do worker.

Documentação atualizada: `docs/external-data.md` (simulador), `docs/model.md` (ficha e
`labels`), `README.md` (garantias do worker, `backfill` e `labels`) e a ajuda da CLI.

## Como foi verificado

Nesta máquina a porta 5432 é de outro projeto, então o banco de teste ficou na 5433:
`TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5433/fraudradar_vinicius_test`.

- `uv run ruff check . && uv run ruff format --check .`: sem erros, 248 arquivos formatados.
- `REQUIRE_TEST_DB=1 uv run --group api --group ml pytest`: **543 passed, 0 skipped**. Antes
  das mudanças eram 533 passed, 0 skipped; são 10 testes novos.
- Os testes novos falham no código antigo, conferido trocando o arquivo e voltando:
  - simulador: 94% das transações simuladas eram "primeira transação entre as duas contas";
    no worker, 148 de 300 pares eram novos. Agora são 0% e 0;
  - trava: o conjunto externo com datas antigas era recusado ("semana dentro do período de
    treino"). Sem a mudança do início do histórico, o lote quebrava ("Input data must be 2
    dimensional and non empty"), porque não lia nenhuma transação.
- Web (`pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build`), num container
  `node:24-alpine` sobre uma cópia dos arquivos versionados (não há Node nesta máquina): lint
  sem erros, **61 de 61 testes** (0 pulados) e build pronto (15 páginas). O teste
  `docker-config` chama `docker compose config`, então o container recebeu o `docker-cli` e o
  `docker-cli-compose` do Alpine. O front não mudou.
- Conferência extra do simulador com dado real, só leitura, no banco local do Vinicius: as
  últimas 8 semanas do SAML-D (1,65 milhão de transações), o modelo oficial `lightgbm_v1` e 500
  transações simuladas sem o padrão.

  | Medida | Contas na fila | "Primeira transação do par" |
  |---|---|---|
  | Semana real de 14/08/2023 | 261 de 105.775 (0,25%) | 11,9% |
  | Simulador antigo | 58 de 917 (6,3%) | 100% |
  | Simulador novo | 1 de 743 (0,1%) | 0% |

  Com só 8 semanas de histórico (o worker lê desde `history_start`), o antigo deu 6,3%, e não
  os 30% do teste de ponta a ponta. A direção é a mesma: o novo fica no nível do dado real.

## Decisões tomadas aqui

- **Início do histórico em outro conjunto.** Processar "toda semana" de um conjunto mais antigo
  que o `history_start` da ficha não lia nenhuma transação e quebrava. Por isso o histórico
  começa na primeira transação do conjunto. No conjunto do treino nada muda.
- **Ficha de retreino sem `training_dataset`.** O 104 manda tratar ficha sem o campo como
  `saml-d`. Mantive isso para o oficial, mas a ficha lida de `models/<slug>/`, gravada antes do
  campo, vale pela pasta (`<slug>`), para um retreino antigo não processar as semanas que ele
  mesmo viu.
- **Limiar da cópia em 99%**, e a relação continua `new_dataset`, porque continuar com datas
  que cruzam é recusado. A mensagem pede para conferir a origem antes de importar.

## O que não foi verificado e o que fica em aberto

- O fluxo no Docker não foi refeito: o banco local do Vinicius ainda tem o esquema da `main`, e
  ele não foi migrado nem apagado. Vale o Pedro repetir o teste de ponta a ponta: simular 500
  transações, importar o banco externo de teste como conjunto novo e rodar
  `docker compose run --rm worker labels`.
- O simulador ainda tira a hora do dia das 5.000 transações mais recentes, todas das últimas
  horas do conjunto. A hora não entra no modelo.
- No fan-out, uma linha que veio de saque ou depósito em espécie vira o CAIXA no cálculo, e a
  ligação com a conta central se perde. Já era assim antes.
- A skill `fraudradar-overview` ainda não descreve esta branch (`serve`, conjuntos, `labels`).
