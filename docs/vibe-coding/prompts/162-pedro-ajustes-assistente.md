---
id: 162
area: ia
autor: Pedro
destino: Claude Code (conta 2)
pai: 161
data: 2026-11-18
---

# Ajustes do assistente depois do PR #31

Com o app rodando localmente e o PR #31 já mergeado e publicado na Vercel, o Pedro pediu:

> 1 - so ta mostrando um modelo gemini
> 2 - permita aumentar lateralmente o chat, arrastando ele
> 3 - "O que é a tipologia fan-out? / A base de dados recuperada não cobre a pergunta sobre a
> tipologia fan-out. Os trechos disponíveis abordam apenas os sujeitos obrigados [...] [F1] [F2]
> [F3]. Esta resposta não constitui um parecer jurídico definitivo e a decisão exige revisão
> humana. / Com base na Lei 9.613/1998" não é a resposta esperada, se não tem na base de dados,
> então o modelo tem que responder com base no conhecimento dele, a menos que seja uma pergunta
> nao pertinente
> 4 - tudo ele fica falando dessa tal de fonte, ele não precisa ficar falando disso, é só deixar a
> fonte anexada no final e pronto
> 5 - https://fraudradar-web.vercel.app/ na versão deployada, que ja ta na main com a pr mergeada,
> o chat fica carregando infinitamente o modelo, funciona, mais o modelo fica carregando em loop,
> com o botão meio que "tremendo", esse erro em loop
> `GET https://api.163.176.230.148.sslip.io/ai/models 404 (Not Found)` (repetido)

Diagnóstico da IA: a API de produção ainda roda a imagem `main-b71b7d4` (de 17/11, antes dos PRs
#29 a #31), por isso o 404 e também a resposta do item 3, que passou pela rota jurídica antiga sem
roteador. O loop vem do front: quando `/ai/models` falha, o efeito de abertura chama de novo sem
limite. O item 1 é configuração: `LLM_MODEL_OPTIONS` vazio.
