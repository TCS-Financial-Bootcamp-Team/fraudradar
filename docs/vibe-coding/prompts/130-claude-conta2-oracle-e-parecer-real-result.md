---
id: 130
area: infra
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 129
data: 2026-11-17
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 129: MCP da Oracle, SSH e o parecer com o Gemini de verdade

## MCP da Oracle

A Oracle publica servidores MCP oficiais para a OCI (pacotes `oracle.oci-*-mcp-server`):

- o **Compute Instance Agent** roda comandos dentro da VM pelo "Run Command" da OCI;
- o da **API** roda comandos da CLI da OCI;
- o de **Compute** lista e cria instâncias.

Para operar a VM, só o primeiro serve. Ele precisa de três coisas na conta da Oracle do Victor:
credenciais da API da OCI, o plugin Run Command ligado na VM e as políticas de IAM. O SSH resolve o
mesmo com bem menos configuração.

## SSH

Foi criada nesta máquina uma chave só para a VM: `~/.ssh/fraudradar_oracle_ed25519`. A parte
pública vai para o `~/.ssh/authorized_keys` da VM; a privada não sai daqui, e o acesso é revogado
apagando a linha. Falta o Victor passar:

- o IP;
- o usuário (`opc` ou `ubuntu`);
- a pasta do projeto na VM.

## Problemas no trecho do `.env` de produção

- **`FRAUDRADAR_SUPABASE_URL` aponta para a página de login do front na Vercel.** Em produção é
  dele que a API tira o `SUPABASE_URL` (`infra/docker-compose.prod.yml`), para buscar as chaves
  públicas do login (JWKS). Com esse valor, toda rota protegida falha. O certo é o endereço do
  projeto do Supabase, sem caminho (`https://<projeto>.supabase.co`).
- **`SUPABASE_URL` termina em `/rest/v1/`.** Em produção ele é sobrescrito pelo de cima. Rodando
  sem o arquivo de produção, quebra o login do mesmo jeito.
- **`DATABASE_URL` estava cortado.** Em produção não importa: o Compose monta a URL com
  `FRAUDRADAR_DB_PASSWORD`.
- **`CORS_ORIGINS` não aparece no trecho.** Precisa incluir o domínio da Vercel.

## Teste com o Gemini de verdade (nesta máquina)

A chave funciona com o `gemini-3.5-flash-lite` pela mesma API que o código usa. Montagem do teste:

- banco local da demo (3.298 alertas);
- `worker rag-load` (58 trechos de 28 artigos);
- API local com o login desligado e a chave só no ambiente do processo, nunca no `.env`.

| Chamada | Resultado |
|---|---|
| Parecer do alerta 1 (o id curto que dava 500) | HTTP 200 em 5,4 s; fontes: arts. 11, 10 e 10; cita [F1] e [F2]; nenhum número de conta no texto; tipologia "Indefinida" |
| Parecer do alerta 3730 | HTTP 200 em 2,4 s; tipologia `cash_withdrawal`, "Saque em espécie" no alerta |
| Chat do alerta 1 | HTTP 200, com fontes |
| Chat jurídico geral | HTTP 200 |

Os pareceres vieram em markdown, que o front formata desde o PR #24. Cada parecer gravou uma
linha `assessment_generated` em `audit_log`, com o modelo e a tipologia. O banco local ficou com a
base do RAG e esses dois pareceres.

## Segurança

A chave do Gemini e a senha do Postgres de produção foram coladas no chat. Elas não entraram em
arquivo, registro, memória nem commit. Mesmo assim:

- vale trocar a chave depois que o servidor estiver configurado;
- vale usar uma senha mais forte no banco. Hoje ela tem 8 dígitos, embora a porta do banco não
  fique exposta em produção.
