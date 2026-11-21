---
id: 173
area: docs
autor: Claude Code (conta 2, do Pedro)
pai: 172
data: 2026-11-21
---

# Resultado: docs/erd/05-full

- `docs/erd/05-full.mmd`: as 21 tabelas na ordem do `01-overview`, com os blocos de colunas dos
  diagramas 02, 03 e 04 e as ligações do 01. Um script conferiu as colunas de cada tabela contra
  `db/init/002_tables.sql` a `006_chat.sql`: todas batem.
- `.svg` e `.png` (2x) desenhados com o Mermaid 11.6.0, a primeira versão que aceita as cores
  (`classDef`) no `erDiagram`; o vermelho do gabarito e o verde do retorno dos analistas ficam.
- O diagrama é grande (vertical) e serve para consulta; para slide, os diagramas por área seguem
  melhores.
