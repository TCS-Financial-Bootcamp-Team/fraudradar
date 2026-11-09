---
id: 068
area: infra
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 067
data: 2026-11-09
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado dos prompts 066 e 067: documento do Terraform

No 066 a IA entendeu "skill" como skill de IA e criou `.agents/skills/fraudradar-terraform/`.
O 067 corrigiu: o pedido era o documento que explica o Terraform. A skill foi apagada antes de
qualquer commit, e os apontamentos para ela nas skills `fraudradar` e `fraudradar-overview`
foram desfeitos.

## O que foi feito

- `infra/terraform/README.md`, novo: por que o Terraform existe (requisito do bootcamp, local,
  sem nuvem), diagrama do sistema que ele sobe e o papel de cada peça (db, api, web, worker,
  Supabase), como o Terraform trabalha (init, plan, apply, state, destroy), cada arquivo, cada
  recurso do `main.tf` com cada configuração, a tabela de variáveis e de saídas, o passo a passo
  da demo pelo Terraform, as diferenças em relação ao Compose, problemas comuns e o que o CI
  confere.
- `README.md` (seção da API): link para o documento novo.

## Como foi verificado

- Leitura de `infra/terraform/*.tf`, `infra/docker-compose.yml`, `api/Dockerfile`,
  `web/Dockerfile`, `db/init/`, `web/src/lib/supabase/config.ts`, `web/src/proxy.ts`,
  `src/fraudradar/config.py`, `api/dependencies.py` e do job `terraform` do CI.
- Em `infra/terraform/`, com Terraform 1.16.6: `terraform fmt -check -recursive`,
  `terraform init -backend=false -input=false` e `terraform validate`, todos ok.
- `terraform apply` **não** foi rodado: o Compose estava no ar e as portas colidem. O passo a
  passo da seção 8 do documento não foi executado de ponta a ponta pelo Terraform.

## Achado: pelo Terraform ninguém consegue entrar no app

A `docker_image.web` não passa `NEXT_PUBLIC_SUPABASE_URL` nem
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como build arg, ao contrário do Compose. Sem elas, o
`web/src/proxy.ts` manda toda tela para `/login`, e o login não funciona. Também faltam
`CORS_ORIGINS` e o healthcheck da API. Está na seção 9 do documento. A correção não foi feita:
fica para um PR `fix(infra)` (frente 5).

## Em aberto

- Corrigir as diferenças da seção 9 e rodar o passo a passo com um `apply` de verdade.
