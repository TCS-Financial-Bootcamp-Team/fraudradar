---
id: 136
area: infra
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 135
data: 2026-11-17
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 135 (e da correção seguinte): front principal na Vercel com o código atual

Depois do 135, o Pedro avisou que tinha posto as variáveis no projeto errado, porque aquele servia o
front antigo. Pediu para subir o projeto certo com as credenciais e, se não achasse, criar um
deploy novo:

> botei no projeto vercel errado, aquela versão usa o frontend antigo, arruma ai, sobe o projeto ai
> com todas as credenciais ja configuradas, se nao achar o projeto, pode subir um deploy novo

## O que estava errado

- O projeto `fraudradar-web`, na conta da Vercel do Pedro, é o front principal, mas não está ligado
  ao Git. Os deploys eram envios pelo CLI de uma cópia antiga da pasta `web/` (26/10). O redeploy
  feito depois de mudar as variáveis só reconstruiu esse código antigo.
- Em produção, `NEXT_PUBLIC_USE_MOCKS` ainda valia `"true"`. `NEXT_PUBLIC_API_URL` e o Supabase
  estavam certos.
- A API de produção não liberava o domínio do front principal no CORS.

## O que mudou

1. **API de produção:** o domínio do front principal entrou no `CORS_ORIGINS`, junto com os do
   Victor, com backup do override e do `production.env`. A api foi recriada e voltou saudável.
   Conferido pelo endereço público:
   - o domínio do front principal é aceito;
   - um domínio qualquer recebe 400;
   - sem login, a API responde 401.
2. **Vercel:** `NEXT_PUBLIC_USE_MOCKS=false` em produção e em preview, com `vercel env update`. O
   valor foi conferido depois.
3. **Front atual no ar:** a pasta `web/` da `main` (`ac4f8f7`) foi publicada a partir de uma cópia
   limpa (`vercel deploy --prod`, build na Vercel). O deploy ficou pronto em 57 s e já responde no
   domínio principal. A página de login publicada é a do front atual: seletor PT | EN e o texto
   "Use a conta da sua equipe de PLD.".

## Não verificado

- As telas logadas: falta alguém entrar pelo front principal, fora da rede do escritório (que
  bloqueia o domínio da API), e as chamadas aparecerem no log da API.
- O Supabase com o domínio novo nas URLs de redirecionamento. Sem isso, os links de "esqueci a
  senha" e de confirmação de cadastro levam ao endereço antigo.

## Para o futuro

- O projeto da Vercel continua sem Git: cada mudança no front precisa de um novo
  `vercel deploy --prod` a partir de `web/`. Para publicar a cada merge, é preciso ligar o projeto
  ao repositório (pasta raiz `web`, branch `main`).
- O CLI recomendou ligar a verificação em duas etapas (2FA) na conta da Vercel.
