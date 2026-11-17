---
id: 124
area: infra
autor: agy (Antigravity CLI, gemini-4-hydrogen-high)
destino: Claude Code (conta 2, do Pedro)
pai: 123
data: 2026-11-17
tipo: resposta
---

# Resultado da delegação 123: volume do cache, restart do banco, senha do worker-serve, CI e README

## O que mudou

| Arquivo | Mudança |
|---|---|
| `infra/docker-compose.yml` | Um volume só para o cache do modelo de embeddings: `hf_cache`, o nome que o servidor da Oracle já usa. O `db` ganha `restart: unless-stopped` |
| `infra/docker-compose.prod.yml` | `worker-serve` com a `DATABASE_URL` de `FRAUDRADAR_DB_PASSWORD`, como a api e o worker |
| `.github/workflows/ci.yml` | `pnpm test` no job web; `terraform fmt -check` também em `infra/terraform-oci` |
| `README.md` | Linha das rotas de conexões refeita (listar, cadastrar, remover, testar, importar); upgrade `008` em "Atualizar um banco que já existia" |
| `rag/README.md`, `infra/terraform/README.md` | `hf-cache` vira `hf_cache` |
| `web/src/features/alerts/components/replay-controls.tsx` | Apagado: nada importava o componente |

Por que cada mudança:

- Dois PRs deixaram o mesmo cache em dois volumes, `hf_cache` e `hf-cache`, no mesmo caminho. O
  Compose usava só o último.
- O `worker-serve` volta sozinho quando o Docker sobe, mas o `db` não voltava, e o trabalhador
  ficava reiniciando sem parar ("banco indisponível").
- Em produção, o `worker-serve` usava a senha padrão do banco, e os trabalhos (processar, simular,
  retreinar) não rodariam.

## Verificação (relatada pelo agy e conferida pelo Claude)

- `pnpm install`, `pnpm lint`, `pnpm test` (84 de 84) e `pnpm build` passaram.
- `pytest tests/test_agent_skill.py tests/test_dockerfiles.py`: 6 passaram.
- `terraform fmt -check` passou em `infra/terraform` e em `infra/terraform-oci`.
- `docker compose ... config` passou com a base e com a base mais a produção. Com
  `FRAUDRADAR_DB_PASSWORD=EXEMPLO`, a api, o worker e o `worker-serve` usam `EXEMPLO`, e só o
  volume `hf_cache` aparece.

O Claude também reescreveu o parágrafo do 008 no README, que tinha ficado numa linha só.

## Fica para quem tem o servidor

O volume antigo `hf-cache` de quem rodou o `rag-load` antes deste PR fica órfão. O modelo (uns
470 MB) é baixado de novo uma vez no `hf_cache`. Depois, o volume antigo pode ser apagado com
`docker volume rm fraudradar_hf-cache`.
