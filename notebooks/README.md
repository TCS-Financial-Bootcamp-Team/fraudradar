# notebooks/

Notebooks exploram e documentam. Lógica reaproveitável (carga, features, score,
IA) vai para `src/fraudradar` e é importada aqui — nunca o contrário.

| Notebook | Frente | Conteúdo |
|---|---|---|
| `01_tratamento.ipynb` | 1 Dados e SQL | carga do CSV com dtypes compactos, limpeza das tipologias, parquet, carga no Postgres |
| `02_eda.ipynb` | 1 Dados e SQL | análise exploratória, distribuição por tipologia, país, moeda, tipo de pagamento |
| `03_modelo.ipynb` | 2 Modelo | features, treino LightGBM com corte temporal, limiar, fila por conta |
| `04_avaliacao_llm.ipynb` | 3 IA generativa | avaliação do RAG e dos pareceres (fidelidade às fontes, validador) |

Kernel: `uv sync --all-groups` e escolha o `.venv` do repositório.
Limpe as saídas antes de commitar notebooks pesados.
