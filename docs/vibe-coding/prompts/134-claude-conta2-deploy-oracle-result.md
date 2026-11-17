---
id: 134
area: infra
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 131
data: 2026-11-17
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 131: produção atualizada para a main e um bug do RAG achado no teste

## Acesso

A chave que o Victor mandou funciona por SSH a partir da rede do Pedro. O firewall dessa rede só
bloqueia o HTTPS do domínio `sslip.io`. A chave foi copiada para `~/.ssh` com leitura só para o
usuário do Pedro.

## Como a produção estava

- **Deploy:** o Compose roda da pasta `~/fraudradar/infra` com três overrides em
  `~/.config/fraudradar/`:
  - um arquivo de credenciais;
  - um JSON que fixa a imagem e o ambiente da api;
  - o `production.env`.

  As imagens são montadas a partir de cópias temporárias do código em `/tmp`.
- **HTTPS:** fica com o Caddy, fora do repositório.
- **API:** roda a imagem `fraudradar-api:ai-abc3f3b`, a branch do Victor com o bug do id curto.
  A configuração do Supabase está certa, diferente do trecho de `.env` colado no 129. O CORS só
  libera os domínios da Vercel do Victor.
- **Banco:** base da lei carregada (58 trechos revisados), 3.190 alertas, 14 semanas, upgrade 008
  aplicado.
- **`worker-serve`:** roda fora do Compose, com uma imagem da `main` de hoje cedo. Não precisou de
  imagem nova: o único código novo do worker é o `rag-load`.
- **Containers temporários do Victor:** `fraudradar-ci-db-39112` e
  `fraudradar-restore-verify-1711`. Ninguém mexeu neles.

## Deploy da main (`ac4f8f7`)

1. Backup do banco em `~/fraudradar-backups/fraudradar_predeploy_main-ac4f8f7.dump` (289 MB).
2. Imagem `fraudradar-api:main-ac4f8f7` montada a partir de `/tmp/fraudradar-main-ac4f8f7`.
3. Teste da imagem num container avulso com o ambiente de produção, sem gravar nada: código novo
   presente, modelo configurado, chat jurídico respondendo com fontes.
4. Backup do override em `production-runtime.pre-main-ac4f8f7.backup.json`, troca da imagem e
   recriação só da api. Ela ficou saudável, e o `/health` respondeu `ok` também pelo HTTPS público.
5. Parecer de teste no alerta 1 (o id que dava 500): HTTP 200, fontes arts. 11 e 10, nenhum número
   de conta. Foi gravado com o analista "Claude Code (teste do deploy)".

Para voltar à imagem anterior: copiar o backup do override por cima do
`production-runtime.override.json` e recriar a api com o mesmo comando do Compose.

## Bug achado no teste

O chat do alerta falhou 3 de 3 vezes com `ValueError: Quantidade de evidencias inconsistente.`
(500). A causa está no RAG da `main`, não no deploy: quando um artigo não cabe no limite do
contexto, o formatador o descarta sem avisar, e as contagens deixam de bater. A correção (registros
132 e 133) está no PR da branch `fix/ai-legal-context-count`. Depois do merge, a api de produção
precisa ser montada de novo da mesma forma.

## Pendente

- O domínio do front principal (a Vercel do time, não a do Victor) no `CORS_ORIGINS` da produção:
  falta o Pedro passar o endereço.
- Merge e deploy da correção do contexto jurídico.
- Os containers temporários do Victor, se ele não precisar mais deles.
