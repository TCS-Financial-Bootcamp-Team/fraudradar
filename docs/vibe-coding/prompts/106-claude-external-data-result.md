---
id: 106
area: geral
autor: Claude Code (conta 1, do Pedro)
destino: Pedro
pai: 098
data: 2026-11-12
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado dos prompts 095 e 098: processamento contínuo, contas suspeitas, bancos externos e retreino

Branch `feat/external-datasets`. Desenho em `docs/external-data.md`. Código de Codex (097, 099),
Claude conta 2 Sonnet (100, 101, 102, 103) e Claude do Vinicius (104/105); o Claude do Pedro
planejou, dividiu, revisou, juntou as frentes, resolveu os conflitos e testou de ponta a ponta.

## O que entrou

- Conjuntos de dados isolados por schema do Postgres (`X-Dataset`, `--dataset`, `public.datasets`).
- Fila `public.jobs` e o serviço `worker-serve` no Compose: agenda um processamento por conjunto no
  intervalo configurável (60 min por padrão), recalcula só a semana aberta (alertas com decisão
  ficam), congela as fechadas e recupera trabalho preso.
- Contas suspeitas como tela principal; "Processar agora"; simulador de transações (modo
  demonstração); o "Liberar próxima semana" saiu.
- Conexões com Postgres externo (senha cifrada, hosts liberados, leitura só de leitura), relatório
  de compatibilidade, as duas perguntas (relação e processamento), importação e acompanhamento.
- Retreino por conjunto só com gabarito, versão `<slug>/vN`, comparação e promoção com auditoria;
  a API não lê `ground_truth` (o worker mede e guarda o resumo; `python -m worker labels`).

## Verificação

- Suítes (Claude, depois de juntar a `main`): `ruff` limpo; `pytest` com `REQUIRE_TEST_DB=1`:
  543 passed; `pnpm lint`, `pnpm test` (64) e `pnpm build` verdes.
- Banco local migrado sem apagar dados (002 novo + 003/004/005 numa transação); `worker labels`:
  SAML-D com 47 semanas rotuladas.
- Docker, API real:
  - contas suspeitas: 2.587 contas a partir dos alertas das 15 semanas;
  - simulação antiga (pares sorteados) apagada pelo `DELETE /ingestions/{id}`; nova simulação de
    500 transações: 2 alertas para 811 contas (0,25%), contra 263 de 890 antes da correção;
  - banco externo de teste (`extsource`, 30 mil linhas do SAML-D com gabarito): relatório
    compatível, sugestão de conjunto separado, importação como `banco-teste` e processamento
    (11 alertas; recall baixo porque são 2 dias sem histórico das contas);
  - retreino recusado no `banco-teste` (1 semana rotulada) e liberado no SAML-D;
  - depois de reprocessar a semana aberta, os alertas 3126 (comunicação aprovada) e 3127
    (rascunho) continuam com as decisões; a semana fechada de 21/08 não mudou.
- Achado só no teste de ponta a ponta e corrigido pelo Claude: a imagem Docker não levava o DDL que
  cria conjuntos (`fix(infra)`).

## Em aberto

- O Docker Desktop caiu duas vezes nesta sessão; cada processamento do `worker-serve` lê as 9,5 mi
  de transações (~7 GB). A causa não foi confirmada; se for memória, o processamento contínuo
  precisa calcular as variáveis só da janela recente em vez de todo o histórico.
- Telas novas não foram vistas no navegador pelo Claude (o Playwright perdeu a sessão do Supabase):
  falta a conferência visual do Pedro.
- Mudança de esquema: o time precisa de `docker compose down -v` (ou aplicar 003/004/005 e o
  `ingestions.source` do 002) e de `CONNECTIONS_SECRET_KEY` e `EXTERNAL_DB_ALLOWED_HOSTS` no `.env`.
- O banco local do Pedro tem o banco de teste `extsource` e o conjunto `banco-teste`, criados para
  o teste de ponta a ponta.
