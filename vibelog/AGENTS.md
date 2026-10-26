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
- Use `--origem-id` estável: repetir o comando atualiza o nó sem duplicar.
- Não registre senhas, chaves, dados pessoais ou números de conta.

## Áreas
`frontend`, `backend`, `ml`, `ia`, `dados`, `infra`, `docs`, `geral`.
Não classifique todo o projeto como frontend. Em trabalhos mistos, crie filhos.

## Exemplos
```powershell
pnpm vibelog no --tipo prompt_humano --area ml --autor pedro --titulo "Treinar baseline" --origem-id "tarefa-42:humano" --arquivo ../trash/prompt.md
pnpm vibelog no --tipo prompt_ia --area ml --autor claude-conta-2 --destino codex-conta1 --pai "tarefa-42:humano" --titulo "Implementar treino" --origem-id "tarefa-42:delegacao" --arquivo ../trash/delegacao.md
pnpm vibelog no --tipo resposta --area ml --autor codex-conta1 --pai "tarefa-42:delegacao" --titulo "Baseline validado" --branch feat/modelo --commit abc1234 --origem-id "tarefa-42:resultado" --arquivo ../trash/resultado.md
pnpm vibelog evidencia --no UUID_RETORNADO --tipo commit --url https://github.com/TCS-Financial-Bootcamp-Team/fraudradar/commit/abc1234 --legenda "Treino e validação"
pnpm vibelog print --no UUID_RETORNADO --url http://localhost:3000 --tema escuro --legenda "Resultado visual"
pnpm vibelog evidencia --no UUID_RETORNADO --tipo log --arquivo ../trash/validacao.log --legenda "Métricas do teste"
```

Instale o navegador antes dos prints: `pnpm exec playwright install chromium`.
Prints abrem uma sessão nova; uma tela protegida pode mostrar o login.
Para capturar uma tela autenticada, use uma captura revisada e `evidencia`.
Conteúdo textual passa por redação automática; revise imagens antes do envio.
Transcritos: teste primeiro com `--dry-run`; não importe sessões de terceiros.
Não altere o esquema Supabase nem use a chave secreta no código do viewer.

Leia os guias de `node_modules/next/dist/docs/` ao alterar APIs do Next.
