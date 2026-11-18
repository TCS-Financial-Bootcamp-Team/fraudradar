---
id: 160
area: ia
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 159
data: 2026-11-18
---

# Teste com o Gemini real: texto perdido, moeda, links prometidos e links no texto

Com a suíte verde (1057 testes com Postgres), a IA rodou o agente contra o Gemini real (gemini-3.5-flash-lite) e o banco local. Ferramentas, links, histórico e o guarda de contas funcionaram; quatro defeitos de qualidade apareceram. Prompt enviado:

````text
Repository: FraudRadar (C:\codigo\pessoal\fraudradar), branch `feat/ai-assistant-agent`, uncommitted work on the assistant agent (src/fraudradar/ai/system_agent.py, app_guide.py, api/repositories/chat.py, api/routes/ai.py). Same rules as before: read AGENTS.md and api/AGENTS.md; LLM logic in src/fraudradar/ai; API never reads ground truth; LLM never receives account numbers; PT-BR comments/messages; do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add; do not touch web/; do not edit docs/vibe-coding/prompts/; never read .env.

The reviewer ran the agent against the REAL Gemini (gemini-3.5-flash-lite) and the local database. It works (tools, links, persistence, no account numbers), but four quality bugs showed up. Fix them in src/fraudradar/ai/system_agent.py (and the tool payloads in api/repositories/chat.py where noted), with tests using the fake client:

1. Lost text. Question "Quais são os 3 alertas com a nota mais alta da semana de 2023-09-04?" returned only the closing sentence ("Se precisar de mais detalhes sobre alguma dessas ocorrências, estou à disposição!"); the list was lost. The model writes text in the SAME response as function calls, and run_system_agent only keeps the text of the last response. Keep the text parts of every model response in order (text parts only, never function-call parts) and build the final answer from them, skipping exact duplicates; then run the existing validation/redaction on the joined text. Also tell the model in SYSTEM_AGENT_INSTRUCTION to put the complete answer in its final message, without "vou consultar..." style narration.
2. Wrong currency and number format. It answered "R$ 49,85" and "Nota de risco: 91.5". SAML-D amounts are in British pounds. In every agent tool payload rename `total_amount` to `total_amount_gbp` (and `flagged_amount` to `flagged_amount_gbp`), and in the instruction say: amounts are in libras esterlinas, written as "£ 49,85"; numbers use the Brazilian format (91,5; 27,5%); never write R$. Same convention the decision chat already uses.
3. Promised links that do not exist. In "Resuma os alertas desta página" it wrote "acesse os links abaixo" with empty bullets, but never called suggest_link. Instruction: to offer navigation, call suggest_link (one call per link, up to 5); never mention links/buttons "abaixo" unless suggest_link returned added=true in this turn.
4. Links in the text. It wrote "[Ir para Monitoramento]( /monitoring )" in the answer body. Post-process every system answer: replace any Markdown link `[label](anything)` with just `label`, and remove bare URLs (http/https/www and javascript:) — navigation only through `links`. Instruction: never write URLs or Markdown links in the text.

Add tests: text from a response that also has function calls is kept; duplicates dropped; Markdown links and URLs stripped; tool payloads use *_gbp keys. Run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest` with REQUIRE_TEST_DB=1 and TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@127.0.0.1:5432/fraudradar_antigravity_test (Postgres is running). Final report in English: changes, files, test summary.
````
