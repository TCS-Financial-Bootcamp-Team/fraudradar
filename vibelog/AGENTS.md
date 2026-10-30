# VibeLog — registro pelos agentes

Humanos apenas consultam. Registre pela CLI; nunca escreva pelo viewer.
Execute os comandos abaixo a partir de `vibelog/` (PowerShell).
Use as credenciais de `.env.local`; nunca as imprima ou versione.

## Quando registrar
- Cada prompt humano: `prompt_humano`, autor da pessoa, área predominante.
- Cada delegação: `prompt_ia`, autor do agente, destino e pai do prompt original.
- Cada entrega: `resposta`, pai da delegação ou prompt atendido.
- Decisões relevantes: `marco`, ligado ao contexto que as originou.
- Na entrega, anexe commit e prints do resultado quando aplicáveis.
- Use `--source-id` estável: repetir o comando atualiza o nó sem duplicar.
- Não registre senhas, chaves, dados pessoais ou números de conta.

## Áreas
`frontend`, `backend`, `ml`, `ia`, `dados`, `infra`, `docs`, `geral`.
Não classifique todo o projeto como frontend. Em trabalhos mistos, crie filhos.

## Exemplos
```powershell
pnpm vibelog node --type prompt_humano --area ml --author pedro --title "Treinar baseline" --source-id "tarefa-42:humano" --file ../trash/prompt.md
pnpm vibelog node --type prompt_ia --area ml --author claude-conta-2 --target codex-conta1 --parent "tarefa-42:humano" --title "Implementar treino" --source-id "tarefa-42:delegacao" --file ../trash/delegacao.md
pnpm vibelog node --type resposta --area ml --author codex-conta1 --parent "tarefa-42:delegacao" --title "Baseline validado" --branch feat/modelo --commit abc1234 --source-id "tarefa-42:resultado" --file ../trash/resultado.md
pnpm vibelog evidence --node UUID_RETORNADO --type commit --url https://github.com/TCS-Financial-Bootcamp-Team/fraudradar/commit/abc1234 --caption "Treino e validação"
pnpm vibelog print --node UUID_RETORNADO --url http://localhost:3000 --theme dark --caption "Resultado visual"
pnpm vibelog evidence --node UUID_RETORNADO --type log --file ../trash/validacao.log --caption "Métricas do teste"
```

Instale o navegador antes dos prints: `pnpm exec playwright install chromium`.
Prints abrem uma sessão nova; uma tela protegida pode mostrar o login.
Para capturar uma tela autenticada, use uma captura revisada e `evidence`.
Conteúdo textual passa por redação automática; revise imagens antes do envio.
Transcritos: teste primeiro com `--dry-run`; não importe sessões de terceiros.
Não altere o esquema Supabase nem use a chave secreta no código do viewer.

Leia os guias de `node_modules/next/dist/docs/` ao alterar APIs do Next.
