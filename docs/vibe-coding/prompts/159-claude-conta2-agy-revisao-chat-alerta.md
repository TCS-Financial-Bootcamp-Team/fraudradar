---
id: 159
area: ia
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 157
data: 2026-11-18
---

# Revisão do backend: chat do alerta grava a conversa e usa o agente

Na revisão do resultado de 157, a IA achou três falhas: o chat do alerta não gravava a conversa nem lia o histórico do banco, trocava a rota `system` por `domain` (sem links na página do alerta) e o `web/API_CONTRACTS.md` não foi atualizado. Prompt enviado:

````text
Repository: FraudRadar (C:\codigo\pessoal\fraudradar), branch `feat/ai-assistant-agent`, with uncommitted work from a previous session that implemented the assistant agent (src/fraudradar/ai/system_agent.py, app_guide.py, model_selection.py, api/repositories/chat.py, api/routes/ai.py, db/init/006_chat.sql, db/upgrades/009_chat.sql, tests). Review fixes requested by the reviewer. Same rules as before: read AGENTS.md and api/AGENTS.md; LLM logic in src/fraudradar/ai; API never reads ground truth; the LLM never receives account numbers; comments/docstrings/messages in PT-BR; do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add; do not touch web/ except web/API_CONTRACTS.md; do not edit docs/vibe-coding/prompts/; never read .env.

Fix these in the backend:
1. `POST /alerts/{alert_id}/chat` (api/routes/ai.py chat_about_alert) must follow the conversation contract like `POST /chat`: take `CurrentUser`; when `request.conversation_id` is set, load the last 6 messages from the DB (404 chat.conversation_not_found if not owned / other dataset) and ignore `request.history`; after a successful answer, persist the turn with `_persist_chat_turn` and return `conversation_id`. The same conversation can mix global and alert turns.
2. On the alert chat, the `system` route must NOT be downgraded to `domain`. Run the same system agent as `/chat` (same tools, dataset-scoped), with the page context carrying the alert id (`page="alert"`, `path` from the request, and the alert id so the agent knows which alert is open). `get_alert` already serves the alert summary. Keep `decision`, `legal`, `domain`, `small_talk`, `out_of_scope` exactly as they are on this route.
3. Update web/API_CONTRACTS.md with every new field and route: `GET /ai/models`, `ChatRequest.model`, `ChatRequest.conversation_id`, `ChatContext.path`, `ChatContext.page_state`, `ChatResponse.kind` "system", `links`, `model`, `conversation_id`, the three `/chat/conversations` routes, and the error codes `ai.model_not_allowed` and `chat.conversation_not_found`. Also make sure docs/chat-routing.md describes the alert route persistence.
4. Tests: alert chat persists the turn and returns conversation_id; alert chat with someone else's conversation_id -> 404; alert chat `system` route returns kind=system with links (fake Gemini); existing alert-chat tests stay green (adjust stubs like you did for /chat).

Run `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest`. Final report in English: changes, files, test summary.
````
