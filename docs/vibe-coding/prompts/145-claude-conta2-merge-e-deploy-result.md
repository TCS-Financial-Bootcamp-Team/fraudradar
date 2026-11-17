---
id: 145
area: infra
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 144
data: 2026-11-17
tipo: resposta
---

# Resultado do 144: PRs #27 e #26 na main, API e front principal atualizados

## Merge
- PR #27 (navegação, parecer em modal, chat, apelidos) mergeado com o CI verde.
- PR #26 (contexto jurídico com todas as evidências) conflitava com o #27 só nos imports de
  `tests/test_legal_pipeline_integration.py`: os dois lados foram mantidos, pytest com Postgres
  853/853, CI verde, mergeado. A `main` ficou em `b71b7d4`.

## API na Oracle
1. Backup do banco: `~/fraudradar-backups/fraudradar_predeploy_main-b71b7d4.dump` (276 MB).
2. Código da `main` copiado com `git archive` para `/tmp`, imagem `fraudradar-api:main-b71b7d4`.
3. Teste num container avulso com o ambiente de produção, só leitura: saudação sem fontes; pergunta
   jurídica com 110 palavras e fontes citadas; chat do alerta 1 respondeu 200 em 3 de 3 (antes, 500
   em 3 de 3 com "Quantidade de evidencias inconsistente").
4. Backup do override em `production-runtime.pre-main-b71b7d4.backup.json`, troca da imagem e
   recriação só da api. Ficou `healthy`, e o `/health` respondeu `ok` também pelo HTTPS público.
   O `worker-serve` e o banco não foram tocados. Cópia em `/tmp` apagada.

Para voltar: copiar o backup do override por cima de `production-runtime.override.json` e recriar a
api com o mesmo comando do Compose (projeto `fraudradar`, pasta `~/fraudradar/infra`, env-file
`~/.config/fraudradar/production.env` e os arquivos `docker-compose.yml`, `docker-compose.prod.yml`,
`credentials.override.yml` e `production-runtime.override.json`).

## Front principal
`fraudradar-web` (Vercel do Pedro, sem Git) publicado com `vercel deploy --prod` a partir de uma
cópia limpa de `web/` da `main`. O `fraudradar-test` (Vercel do Victor) publica sozinho pelo Git.

## Incidente
Ao ler o override de produção para descobrir o comando do Compose, o filtro de segredos não cobriu
`DATABASE_URL` e a senha do Postgres de produção apareceu no chat da IA. Não saiu para outro serviço.
Recomendação: trocar a senha (ALTER ROLE no banco e o valor nos arquivos de credenciais da VM).
