---
id: 009
autor: Claude Code
destino: Codex (escritor)
pai: 006
data: 2026-10-26
area: frontend
modelo: gpt-6.1-sol / reasoning high
---

Fix ALL findings below from the code review of branch feat/frontend-base (C:\codigo\pessoal\fraudradar). Read AGENTS.md, web/AGENTS.md, vibelog/AGENTS.md first. Add a regression test for each fix where practical. Do not touch api/, worker/, src/, db/ except: you MAY edit web/Dockerfile, infra/docker-compose.yml and compose.yaml for finding 4 (pass NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_USE_MOCKS as build ARG/ENV from the root .env). Then run: cd web && pnpm lint && pnpm build && pnpm test (or the existing test script); cd vibelog && pnpm lint && pnpm build && pnpm test. All must pass. Do not commit. At the end list each finding with what you changed (file:line) and the test that covers it, in Brazilian Portuguese.

## Findings
1. **critica — [vibelog/scripts/vibelog.ts:186](C:/codigo/pessoal/fraudradar/vibelog/scripts/vibelog.ts:186)**  
   `matter(raw)` executa frontmatter `js`/`javascript`. Um Markdown malicioso executa código na máquina do agente, inclusive com `--dry-run`, após carregar `SUPABASE_SECRET_KEY`. Confirmei com uma expressão inofensiva em memória. **Correção mínima:** aceitar somente frontmatter YAML seguro e rejeitar outros idiomas antes do processamento.

2. **alta — [vibelog/scripts/importadores.ts:22](C:/codigo/pessoal/fraudradar/vibelog/scripts/importadores.ts:22)**  
   A redação preserva integralmente `Authorization: Basic …`, `Authorization: Bearer token-opaco` e senhas em `postgresql://:senha@host/banco`. Esses conteúdos seguem para o banco ou para a saída do dry-run. **Correção mínima:** redigir cabeçalhos de autorização completos e cobrir URLs Postgres com usuário vazio, incluindo testes desses formatos.

3. **alta — [vibelog/scripts/vibelog.ts:131](C:/codigo/pessoal/fraudradar/vibelog/scripts/vibelog.ts:131)**  
   A redação de evidências depende de uma lista incompleta de extensões. Arquivos `.ps1`, `.tsx` ou `.env.local` contendo até os tokens reconhecidos pelo filtro são enviados intactos ao Storage. **Correção mínima:** bloquear arquivos de credenciais e aplicar redação a todo anexo textual aceito, sem depender apenas dessa lista.

4. **alta — [web/src/lib/supabase/config.ts:2](C:/codigo/pessoal/fraudradar/web/src/lib/supabase/config.ts:2)**  
   A autenticação agora exige duas variáveis públicas, mas o Dockerfile e o Compose continuam passando somente `NEXT_PUBLIC_API_URL`. Como `.dockerignore` exclui `.env*`, executar o comando Docker documentado produz um frontend sem configuração de autenticação: login mostra instruções e páginas privadas redirecionam continuamente para ele. **Correção mínima:** repassar URL, chave pública e modo de mocks pelo Compose e pelos `ARG`/`ENV` da etapa de build.

5. **media — [vibelog/scripts/importadores.ts:155](C:/codigo/pessoal/fraudradar/vibelog/scripts/importadores.ts:155)**  
   A identidade da resposta muda conforme o fechamento da sessão. Importar um JSONL Codex antes de `task_complete` gera um ID baseado em hash; repetir após esse evento gera outro ID baseado em `turn_id`. Reproduzi a mudança para a mesma resposta e o mesmo pai. O upsert cria duas respostas. **Correção mínima:** derivar a identidade da resposta do ID estável do prompt correspondente.

6. **media — [web/src/lib/formatacao.ts:25](C:/codigo/pessoal/fraudradar/web/src/lib/formatacao.ts:25)**  
   A pseudonimização elimina qualquer token contendo dígitos, incluindo valores, datas, durações e códigos de regras. Uma pergunta sobre `R-014`, `10.000`, `24 horas` e `2026-10-19` perde todas essas informações antes de chegar à API. Contas diferentes também recebem o mesmo marcador. **Correção mínima:** identificar contas especificamente, usar aliases consistentes e preservar os demais dados necessários à análise.

7. **media — [web/src/features/assistente/schemas/assistente.ts:16](C:/codigo/pessoal/fraudradar/web/src/features/assistente/schemas/assistente.ts:16)**  
   A resposta aceita texto sem limite, mas cada mensagem do histórico permite somente 8.000 caracteres. Uma resposta válida de 8.001 caracteres é exibida; a pergunta seguinte falha localmente na validação, enquanto essa resposta permanecer no histórico. Confirmei a incompatibilidade em memória. **Correção mínima:** compatibilizar os limites e limitar o texto enviado no histórico, considerando também as fontes acrescentadas pelo hook.

Não encontrei caminho da chave secreta para o viewer, redirecionamento aberto ou XSS no Markdown inspecionado. Os ancestrais são preservados nos filtros.

Passaram 14 testes existentes, executados em memória. Não alterei arquivos. Durante a revisão, o conteúdo inicialmente não commitado apareceu nos commits `00f7dfd` e `092a0ad`; os achados permanecem.

**Veredito: reprovado para merge até corrigir a execução de código e as lacunas de redação de segredos.**

